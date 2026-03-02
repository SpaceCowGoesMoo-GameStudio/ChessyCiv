#!/usr/bin/env python3
"""
ChessyCiv Board Editor — Tkinter GUI for visual board editing via Dev-Controls API.

Spawns a Node.js subprocess running the game engine headlessly, communicates via
JSON-line protocol over stdin/stdout.
"""

import json
import os
import subprocess
import sys
import tempfile
import textwrap
import threading
import tkinter as tk
from datetime import datetime
from tkinter import messagebox, simpledialog, ttk

# ---------------------------------------------------------------------------
# Paths & constants
# ---------------------------------------------------------------------------

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

JS_DEPS = [
    "js/SoundManager.js",
    "js/constants.js",
    "js/GameHistory.js",
    "js/Game-Engine/GameEngine.js",
    "js/Game-Engine/setup.js",
    "js/Game-Engine/movement.js",
    "js/Game-Engine/combat.js",
    "js/Game-Engine/production.js",
    "js/Game-Engine/territory.js",
    "js/Game-Engine/diplomacy.js",
    "js/Game-Engine/settlers.js",
    "js/Game-Engine/turns.js",
    "js/Game-Engine/ai-support.js",
    "js/Game-Engine/persistence.js",
    "js/Game-Engine/ml-state-encoder.js",
    "js/AI/constants.js",
    "js/AI/CivChessAI.js",
    "js/AI/AIManager.js",
    "js/AI/analysis.js",
    "js/AI/tracking.js",
    "js/AI/goals.js",
    "js/AI/diplomacy.js",
    "js/AI/production.js",
    "js/AI/objectives.js",
    "js/AI/pathfinding.js",
    "js/AI/positioning.js",
    "js/AI/movement.js",
    "js/AI/settlers.js",
    "js/Dev-Controls/DevExport.js",
    "js/Dev-Controls/DevGame.js",
    "js/Dev-Controls/state.js",
    "js/Dev-Controls/pieces.js",
    "js/Dev-Controls/players.js",
    "js/Dev-Controls/actions.js",
    "js/Dev-Controls/ai-control.js",
    "js/Dev-Controls/game-control.js",
    "js/Dev-Controls/events.js",
    "js/Dev-Controls/ml-bridge.js",
    "js/Dev-Controls/DevManager.js",
]

NODE_PREAMBLE = textwrap.dedent(r"""
    const window = globalThis;
    const navigator = { maxTouchPoints: 0 };
    const document = {
        createElement: () => ({ click() {}, href: '', download: '' }),
    };
    const URL = { createObjectURL: () => 'blob:', revokeObjectURL: () => {} };
    const Blob = class Blob { constructor() {} };
    class AudioContext { constructor() {} }
    window.AudioContext = AudioContext;
    const indexedDB = null;
    window.indexedDB = null;
    const pako = { deflate: (d) => d, inflate: (d) => d };
""")

REPL_SCRIPT = textwrap.dedent(r"""
    // Suppress engine noise
    console.log = () => {};
    console.warn = () => {};

    const readline = require('readline');
    const rl = readline.createInterface({ input: process.stdin });

    let games = {};  // id -> DevGame
    let nextGameId = 1;

    rl.on('line', (line) => {
        let msg;
        try { msg = JSON.parse(line); } catch(e) {
            process.stdout.write(JSON.stringify({id: -1, ok: false, error: 'bad json'}) + '\n');
            return;
        }
        const {id, cmd, method, args} = msg;
        try {
            let result;
            if (cmd === 'createGame') {
                const playerCount = (args && args[0]) || 2;
                const configs = [];
                for (let i = 0; i < playerCount; i++) {
                    configs.push({name: 'P' + (i+1), isHuman: true});
                }
                const gid = nextGameId++;
                const ret = DevManager.createGame(configs, {disableLogging: true, disableGameEnding: false});
                games[gid] = ret.game;
                result = {gameId: gid};
            } else if (cmd === 'call') {
                const gid = msg.gameId || 1;
                const g = games[gid];
                if (!g) throw new Error('No game with id ' + gid);
                if (typeof g[method] !== 'function') throw new Error('Unknown method: ' + method);
                result = g[method].apply(g, args || []);
            } else if (cmd === 'callManager') {
                if (typeof DevManager[method] !== 'function') throw new Error('Unknown manager method: ' + method);
                result = DevManager[method].apply(DevManager, args || []);
            } else {
                throw new Error('Unknown cmd: ' + cmd);
            }
            process.stdout.write(JSON.stringify({id, ok: true, result: result === undefined ? null : result}) + '\n');
        } catch(e) {
            process.stdout.write(JSON.stringify({id, ok: false, error: e.message}) + '\n');
        }
    });

    rl.on('close', () => process.exit(0));
""")

PLAYER_COLORS = {0: "#00ffff", 1: "#ff00ff", 2: "#00ff00", 3: "#ff8800", 4: "#ff66b2", 5: "#ffff00"}
PLAYER_NAMES = {0: "Cyan", 1: "Magenta", 2: "Lime", 3: "Orange", 4: "Pink", 5: "Yellow"}
PIECE_LABELS = {"city": "C", "warrior": "W", "settler": "S"}

CELL_SIZE = 50
BOARD_SIZE = 10

LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "action_log.txt")


# ---------------------------------------------------------------------------
# ActionLogger
# ---------------------------------------------------------------------------

class ActionLogger:
    def __init__(self, path=LOG_FILE):
        self._f = open(path, "a", encoding="utf-8")

    def log(self, method, args, result):
        ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        arg_str = ", ".join(str(a) for a in args) if args else ""
        res_str = str(result)
        if len(res_str) > 100:
            res_str = res_str[:100] + "..."
        self._f.write(f"[{ts}] {method}({arg_str}) → {res_str}\n")
        self._f.flush()

    def close(self):
        self._f.close()


# ---------------------------------------------------------------------------
# NodeBridge
# ---------------------------------------------------------------------------

class NodeBridge:
    """Manages a Node.js subprocess running the ChessyCiv engine with a JSON REPL."""

    def __init__(self):
        self._next_id = 1
        self._proc = None
        self._lock = threading.Lock()
        self._start()

    def _build_bundle(self):
        parts = [NODE_PREAMBLE]
        for dep in JS_DEPS:
            path = os.path.join(REPO, dep)
            with open(path, "r", encoding="utf-8") as f:
                parts.append(f"// --- {dep} ---\n{f.read()}")
        parts.append(REPL_SCRIPT)
        return "\n".join(parts)

    def _start(self):
        bundle = self._build_bundle()
        self._tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".js", delete=False, encoding="utf-8")
        self._tmp.write(bundle)
        self._tmp.close()
        self._proc = subprocess.Popen(
            ["node", self._tmp.name],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def _send(self, msg):
        with self._lock:
            mid = self._next_id
            self._next_id += 1
            msg["id"] = mid
            line = json.dumps(msg) + "\n"
            self._proc.stdin.write(line.encode())
            self._proc.stdin.flush()
            raw = self._proc.stdout.readline()
            if not raw:
                raise RuntimeError("Node process closed unexpectedly")
            resp = json.loads(raw)
            if not resp.get("ok"):
                raise RuntimeError(resp.get("error", "unknown error"))
            return resp.get("result")

    def create_game(self, player_count=2):
        return self._send({"cmd": "createGame", "args": [player_count]})

    def call(self, method, *args, game_id=1):
        return self._send({"cmd": "call", "gameId": game_id, "method": method, "args": list(args)})

    def close(self):
        if self._proc and self._proc.poll() is None:
            self._proc.stdin.close()
            self._proc.wait(timeout=5)
        try:
            os.unlink(self._tmp.name)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# BoardEditor GUI
# ---------------------------------------------------------------------------

class BoardEditor:
    def __init__(self):
        self.bridge = NodeBridge()
        self.logger = ActionLogger()
        self.game_id = None
        self.board_data = None
        self.player_count = 2
        self.selected_tile = None  # (row, col) for Move tool source
        self.move_source = None

        self._build_ui()
        self._new_game(2)

    # -- UI construction ---------------------------------------------------

    def _build_ui(self):
        self.root = tk.Tk()
        self.root.title("ChessyCiv Board Editor")
        self.root.configure(bg="#1a1a2e")
        self.root.resizable(True, True)

        # Menu bar
        menubar = tk.Menu(self.root)
        game_menu = tk.Menu(menubar, tearoff=0)
        game_menu.add_command(label="New 2-Player", command=lambda: self._new_game(2))
        game_menu.add_command(label="New 3-Player", command=lambda: self._new_game(3))
        game_menu.add_command(label="New 4-Player", command=lambda: self._new_game(4))
        game_menu.add_separator()
        game_menu.add_command(label="Quit", command=self._quit)
        menubar.add_cascade(label="Game", menu=game_menu)
        self.root.config(menu=menubar)

        # Main paned layout
        main = tk.PanedWindow(self.root, orient=tk.HORIZONTAL, bg="#1a1a2e", sashwidth=4)
        main.pack(fill=tk.BOTH, expand=True)

        # Canvas
        canvas_size = CELL_SIZE * BOARD_SIZE
        self.canvas = tk.Canvas(main, width=canvas_size, height=canvas_size,
                                bg="#1a1a2e", highlightthickness=0)
        main.add(self.canvas)
        self.canvas.bind("<Button-1>", self._on_canvas_click)
        self.canvas.bind("<B1-Motion>", self._on_canvas_drag)

        # Side panel
        side = tk.Frame(main, bg="#1a1a2e", width=280)
        main.add(side)

        self._build_game_info(side)
        self._build_tool_panel(side)
        self._build_tile_info(side)
        self._build_player_panel(side)
        self._build_status(side)

    def _label(self, parent, text, **kw):
        return tk.Label(parent, text=text, bg="#1a1a2e", fg="#00d4ff",
                        font=("Consolas", 10), anchor="w", **kw)

    def _section(self, parent, title):
        f = tk.LabelFrame(parent, text=title, bg="#1a1a2e", fg="#00d4ff",
                          font=("Consolas", 10, "bold"), padx=5, pady=5)
        f.pack(fill=tk.X, padx=5, pady=3)
        return f

    def _build_game_info(self, parent):
        f = self._section(parent, "Game Info")
        self.lbl_turn = self._label(f, "Turn: -  Round: -")
        self.lbl_turn.pack(anchor="w")
        self.lbl_player = self._label(f, "Current: -")
        self.lbl_player.pack(anchor="w")

        bf = tk.Frame(f, bg="#1a1a2e")
        bf.pack(fill=tk.X, pady=3)
        # Mode toggles
        tf = tk.Frame(f, bg="#1a1a2e")
        tf.pack(fill=tk.X)
        self.sandbox_var = tk.BooleanVar(value=False)
        tk.Checkbutton(tf, text="Sandbox", variable=self.sandbox_var,
                       command=self._toggle_sandbox, bg="#1a1a2e", fg="#ff8800",
                       selectcolor="#333", font=("Consolas", 9),
                       activebackground="#1a1a2e", activeforeground="#ff8800").pack(side=tk.LEFT)
        self.auto_ai_var = tk.BooleanVar(value=False)
        tk.Checkbutton(tf, text="Auto-AI", variable=self.auto_ai_var,
                       command=self._toggle_auto_ai, bg="#1a1a2e", fg="#ff8800",
                       selectcolor="#333", font=("Consolas", 9),
                       activebackground="#1a1a2e", activeforeground="#ff8800").pack(side=tk.LEFT)

        # Turn controls row 1
        bf = tk.Frame(f, bg="#1a1a2e")
        bf.pack(fill=tk.X, pady=3)
        tk.Button(bf, text="End Turn", command=self._end_turn, bg="#333", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)
        tk.Button(bf, text="Step to Human", command=self._step_to_human, bg="#335", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)

        # Turn controls row 2
        bf2 = tk.Frame(f, bg="#1a1a2e")
        bf2.pack(fill=tk.X, pady=1)
        tk.Button(bf2, text="Run AI Turn", command=self._run_ai_turn, bg="#353", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)
        self.run_n_var = tk.IntVar(value=5)
        tk.Spinbox(bf2, from_=1, to=100, textvariable=self.run_n_var, width=4,
                   font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)
        tk.Button(bf2, text="Run N Turns", command=self._run_n_turns, bg="#333", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)

    def _build_tool_panel(self, parent):
        f = self._section(parent, "Tool Mode")
        self.tool_var = tk.StringVar(value="select")
        tools = [
            ("Select", "select"), ("Move", "move"),
            ("Warrior", "warrior"), ("Settler", "settler"),
            ("City", "city"), ("Remove", "remove"),
            ("Paint Territory", "paint"), ("Clear Territory", "clear_terr"),
        ]
        for label, val in tools:
            tk.Radiobutton(f, text=label, variable=self.tool_var, value=val,
                           bg="#1a1a2e", fg="white", selectcolor="#333",
                           font=("Consolas", 9), anchor="w",
                           command=self._tool_changed).pack(anchor="w")

        of = tk.Frame(f, bg="#1a1a2e")
        of.pack(fill=tk.X, pady=3)
        self._label(of, "Owner:").pack(side=tk.LEFT)
        self.owner_var = tk.IntVar(value=0)
        self.owner_combo = ttk.Combobox(of, width=10, state="readonly",
                                        font=("Consolas", 9))
        self.owner_combo.pack(side=tk.LEFT, padx=4)
        self.owner_combo.bind("<<ComboboxSelected>>", self._owner_changed)

    def _build_tile_info(self, parent):
        f = self._section(parent, "Tile Info")
        self.lbl_tile = self._label(f, "Click a tile...")
        self.lbl_tile.pack(anchor="w")
        self.lbl_piece = self._label(f, "")
        self.lbl_piece.pack(anchor="w")

    def _build_player_panel(self, parent):
        f = self._section(parent, "Players / Diplomacy")
        self.player_frame = tk.Frame(f, bg="#1a1a2e")
        self.player_frame.pack(fill=tk.X)

        # Add / Remove player buttons
        pf = tk.Frame(f, bg="#1a1a2e")
        pf.pack(fill=tk.X, pady=2)
        tk.Button(pf, text="+ Add Player", command=self._add_player, bg="#335", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)
        tk.Button(pf, text="- Remove", command=self._remove_player, bg="#533", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)

        # AI conversion
        af = tk.Frame(f, bg="#1a1a2e")
        af.pack(fill=tk.X, pady=2)
        tk.Button(af, text="Make AI", command=self._make_ai, bg="#353", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)
        tk.Button(af, text="Make Human", command=self._make_human, bg="#353", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)
        self._label(af, "Diff:").pack(side=tk.LEFT)
        self.ai_diff_var = ttk.Combobox(af, width=7, state="readonly",
                                        font=("Consolas", 9),
                                        values=["easy", "medium", "hard"])
        self.ai_diff_var.current(1)
        self.ai_diff_var.pack(side=tk.LEFT, padx=2)

        # Diplomacy target
        df = tk.Frame(f, bg="#1a1a2e")
        df.pack(fill=tk.X, pady=3)
        self._label(df, "Target:").pack(side=tk.LEFT)
        self.diplo_target = ttk.Combobox(df, width=10, state="readonly",
                                         font=("Consolas", 9))
        self.diplo_target.pack(side=tk.LEFT, padx=4)

        bf = tk.Frame(f, bg="#1a1a2e")
        bf.pack(fill=tk.X)
        tk.Button(bf, text="Declare War", command=self._declare_war, bg="#600", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)
        tk.Button(bf, text="Propose Peace", command=self._propose_peace, bg="#060", fg="white",
                  font=("Consolas", 9)).pack(side=tk.LEFT, padx=2)

    def _build_status(self, parent):
        f = self._section(parent, "Status")
        self.lbl_status = self._label(f, "Ready")
        self.lbl_status.pack(anchor="w")

    # -- Game management ---------------------------------------------------

    def _new_game(self, player_count):
        self.player_count = player_count
        res = self.bridge.create_game(player_count)
        self.game_id = res["gameId"]
        self.logger.log("createGame", [player_count], res)
        self.move_source = None
        self.sandbox_var.set(False)
        self.auto_ai_var.set(False)
        self._update_owner_combo()
        self._update_diplo_combo()
        self._refresh()
        self._set_status(f"New {player_count}-player game (id={self.game_id})")

    def _update_owner_combo(self):
        values = [f"{i}: {PLAYER_NAMES.get(i, 'P'+str(i))}" for i in range(self.player_count)]
        self.owner_combo["values"] = values
        self.owner_combo.current(0)
        self.diplo_target["values"] = values
        if self.player_count > 1:
            self.diplo_target.current(1)

    def _update_diplo_combo(self):
        pass  # handled in _update_owner_combo

    def _get_owner(self):
        return self.owner_var.get() if self.owner_combo.current() < 0 else self.owner_combo.current()

    def _owner_changed(self, _event=None):
        self.owner_var.set(self.owner_combo.current())

    # -- Bridge helpers ----------------------------------------------------

    def _call(self, method, *args):
        try:
            result = self.bridge.call(method, *args, game_id=self.game_id)
            self.logger.log(method, args, result)
            return result
        except RuntimeError as e:
            self.logger.log(method, args, f"ERROR: {e}")
            self._set_status(f"Error: {e}")
            return None

    # -- Refresh -----------------------------------------------------------

    def _refresh(self):
        self.board_data = self._call("getBoardData")
        self._draw_board()
        self._update_game_info()
        self._update_player_list()

    def _update_game_info(self):
        cp = self._call("getCurrentPlayer")
        if cp:
            idx = cp.get("id", "?")
            name = PLAYER_NAMES.get(idx, f"P{idx}")
            color = PLAYER_COLORS.get(idx, "white")
            self.lbl_player.config(text=f"Current: {name} (id={idx})", fg=color)

        state = self._call("getState")
        if state:
            turn = state.get("turnNumber", "?")
            rnd = state.get("roundNumber", "?")
            self.lbl_turn.config(text=f"Turn: {turn}  Round: {rnd}")

    def _update_player_list(self):
        for w in self.player_frame.winfo_children():
            w.destroy()
        players = self._call("getPlayers")
        if not players:
            return
        self.player_count = len(players)
        for p in players:
            pid = p["id"]
            name = PLAYER_NAMES.get(pid, p.get("name", f"P{pid}"))
            color = PLAYER_COLORS.get(pid, "white")
            elim = " [ELIM]" if p.get("eliminated") else ""
            ai_tag = " [AI]" if p.get("isAI") else ""
            self._label(self.player_frame, f"  {name}{ai_tag}{elim}").pack(anchor="w")
            self.player_frame.winfo_children()[-1].config(fg=color)
        self._update_owner_combo()

    # -- Board drawing -----------------------------------------------------

    def _draw_board(self):
        self.canvas.delete("all")
        if not self.board_data:
            return
        for r in range(BOARD_SIZE):
            for c in range(BOARD_SIZE):
                x0 = c * CELL_SIZE
                y0 = r * CELL_SIZE
                x1 = x0 + CELL_SIZE
                y1 = y0 + CELL_SIZE

                tile = self.board_data[r][c]
                owner = tile.get("owner") if tile else None

                # Background
                if owner is not None and owner >= 0:
                    bg = self._dim_color(PLAYER_COLORS.get(owner, "#333"), 0.3)
                else:
                    bg = "#2a2a3e"

                self.canvas.create_rectangle(x0, y0, x1, y1, fill=bg,
                                             outline="#444", width=1)

                # Piece
                piece = tile.get("piece") if tile else None
                if piece:
                    ptype = piece.get("type", "")
                    label = PIECE_LABELS.get(ptype, "?")
                    powner = piece.get("ownerId", 0)
                    pcolor = PLAYER_COLORS.get(powner, "white")
                    self.canvas.create_text(x0 + CELL_SIZE // 2, y0 + CELL_SIZE // 2,
                                            text=label, fill=pcolor,
                                            font=("Consolas", 16, "bold"))
                    # HP indicator for cities
                    if ptype == "city":
                        hp = piece.get("hp", 0)
                        maxhp = piece.get("maxHp", 0)
                        self.canvas.create_text(x0 + CELL_SIZE // 2, y0 + CELL_SIZE - 8,
                                                text=f"{hp}/{maxhp}", fill=pcolor,
                                                font=("Consolas", 7))

        # Highlight selected tile (move source)
        if self.move_source:
            r, c = self.move_source
            x0, y0 = c * CELL_SIZE, r * CELL_SIZE
            self.canvas.create_rectangle(x0, y0, x0 + CELL_SIZE, y0 + CELL_SIZE,
                                         outline="yellow", width=3)

    @staticmethod
    def _dim_color(hex_color, factor):
        """Dim a hex color by a factor (0-1)."""
        hex_color = hex_color.lstrip("#")
        r = int(int(hex_color[0:2], 16) * factor)
        g = int(int(hex_color[2:4], 16) * factor)
        b = int(int(hex_color[4:6], 16) * factor)
        return f"#{r:02x}{g:02x}{b:02x}"

    # -- Input handling ----------------------------------------------------

    def _rc_from_event(self, event):
        c = event.x // CELL_SIZE
        r = event.y // CELL_SIZE
        if 0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE:
            return r, c
        return None, None

    def _tool_changed(self):
        self.move_source = None
        self._draw_board()

    def _on_canvas_click(self, event):
        r, c = self._rc_from_event(event)
        if r is None:
            return
        tool = self.tool_var.get()
        owner = self._get_owner()

        if tool == "select":
            self._select_tile(r, c)
        elif tool == "move":
            self._handle_move(r, c)
        elif tool == "warrior":
            res = self._call("createWarrior", owner, r, c)
            self._set_status(f"createWarrior → {res}")
            self._refresh()
        elif tool == "settler":
            res = self._call("createSettler", owner, r, c)
            self._set_status(f"createSettler → {res}")
            self._refresh()
        elif tool == "city":
            res = self._call("createCity", owner, r, c)
            self._set_status(f"createCity → {res}")
            self._refresh()
        elif tool == "remove":
            res = self._call("removePiece", r, c)
            self._set_status(f"removePiece → {res}")
            self._refresh()
        elif tool == "paint":
            res = self._call("setTileOwner", r, c, owner)
            self._set_status(f"setTileOwner({r},{c},{owner})")
            self._refresh()
        elif tool == "clear_terr":
            res = self._call("setTileOwner", r, c, -1)
            self._set_status(f"clearTerritory({r},{c})")
            self._refresh()

    def _on_canvas_drag(self, event):
        """Support drag painting for territory tools."""
        tool = self.tool_var.get()
        if tool not in ("paint", "clear_terr"):
            return
        r, c = self._rc_from_event(event)
        if r is None:
            return
        owner = self._get_owner() if tool == "paint" else -1
        self._call("setTileOwner", r, c, owner)
        self._refresh()

    def _select_tile(self, r, c):
        tile = self._call("getTile", r, c)
        if not tile:
            return
        owner = tile.get("owner")
        owner_name = PLAYER_NAMES.get(owner, "None") if owner is not None and owner >= 0 else "None"
        self.lbl_tile.config(text=f"({r}, {c})  Owner: {owner_name}")

        piece = tile.get("piece")
        if piece:
            ptype = piece.get("type", "?")
            hp = piece.get("hp", "?")
            maxhp = piece.get("maxHp", "?")
            powner = PLAYER_NAMES.get(piece.get("ownerId"), "?")
            moved = piece.get("hasMoved", False)
            self.lbl_piece.config(text=f"{ptype}  HP:{hp}/{maxhp}  Owner:{powner}  Moved:{moved}")
        else:
            self.lbl_piece.config(text="(empty)")

    def _handle_move(self, r, c):
        if self.move_source is None:
            self.move_source = (r, c)
            self._draw_board()
            self._set_status(f"Move source: ({r},{c}) — click destination")
        else:
            sr, sc = self.move_source
            self.move_source = None
            res = self._call("movePiece", sr, sc, r, c)
            self._set_status(f"movePiece({sr},{sc},{r},{c}) → {res}")
            self._refresh()

    # -- Actions -----------------------------------------------------------

    def _toggle_sandbox(self):
        enabled = self.sandbox_var.get()
        self._call("setSandboxMode", enabled)
        mode = "ON" if enabled else "OFF"
        self._set_status(f"Sandbox mode {mode} (rules {'bypassed' if enabled else 'enforced'})")

    def _toggle_auto_ai(self):
        enabled = self.auto_ai_var.get()
        self._call("setAutoAI", enabled)
        mode = "ON" if enabled else "OFF"
        self._set_status(f"Auto-AI {mode}")

    def _end_turn(self):
        res = self._call("endTurn")
        self._set_status(f"endTurn → done")
        self._refresh()

    def _step_to_human(self):
        res = self._call("stepToHuman")
        if res:
            n = res.get("aiTurnsPlayed", 0)
            self._set_status(f"Stepped through {n} AI turn(s)")
        self._refresh()

    def _run_ai_turn(self):
        res = self._call("runAITurn")
        if res and res.get("success"):
            n = len(res.get("actions", []))
            self._set_status(f"AI took {n} action(s)")
        else:
            reason = res.get("reason", "?") if res else "error"
            self._set_status(f"Run AI: {reason}")
        self._refresh()

    def _run_n_turns(self):
        n = self.run_n_var.get()
        res = self._call("runTurns", n)
        self._set_status(f"runTurns({n}) → done")
        self._refresh()

    def _add_player(self):
        res = self._call("addPlayer", {})
        if res and res.get("success"):
            self._set_status(f"Added player {res['player']['id']}")
        else:
            self._set_status(f"Add player failed: {res}")
        self._refresh()

    def _remove_player(self):
        target = self.diplo_target.current()
        if target < 0:
            return
        res = self._call("removePlayer", target)
        if res and res.get("success"):
            self._set_status(f"Removed player {target}")
        else:
            self._set_status(f"Remove failed: {res}")
        self._refresh()

    def _make_ai(self):
        target = self.diplo_target.current()
        if target < 0:
            return
        diff = self.ai_diff_var.get()
        res = self._call("setPlayerAI", target, True, diff)
        if res and res.get("success"):
            self._set_status(f"Player {target} → AI ({diff})")
        else:
            self._set_status(f"Make AI failed: {res}")
        self._refresh()

    def _make_human(self):
        target = self.diplo_target.current()
        if target < 0:
            return
        res = self._call("setPlayerAI", target, False)
        if res and res.get("success"):
            self._set_status(f"Player {target} → Human")
        else:
            self._set_status(f"Make Human failed: {res}")
        self._refresh()

    def _declare_war(self):
        cp = self._call("getCurrentPlayer")
        if not cp:
            return
        target = self.diplo_target.current()
        if target < 0:
            return
        res = self._call("declareWar", cp["id"], target)
        self._set_status(f"declareWar({cp['id']},{target}) → {res}")
        self._refresh()

    def _propose_peace(self):
        cp = self._call("getCurrentPlayer")
        if not cp:
            return
        target = self.diplo_target.current()
        if target < 0:
            return
        res = self._call("proposePeace", cp["id"], target)
        self._set_status(f"proposePeace({cp['id']},{target}) → {res}")
        self._refresh()

    # -- Status ------------------------------------------------------------

    def _set_status(self, text):
        if len(text) > 80:
            text = text[:80] + "..."
        self.lbl_status.config(text=text)

    # -- Quit --------------------------------------------------------------

    def _quit(self):
        self.bridge.close()
        self.logger.close()
        self.root.destroy()

    # -- Run ---------------------------------------------------------------

    def run(self):
        self.root.protocol("WM_DELETE_WINDOW", self._quit)
        self.root.mainloop()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    app = BoardEditor()
    app.run()
