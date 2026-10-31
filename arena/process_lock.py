"""Lock entre arena, interface e fila local. Nunca envia sinais para verificar PIDs Windows."""
from __future__ import annotations
import atexit
import ctypes
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ACTIVE = ROOT / "results/arena/active.json"
_held = None


def pid_alive(pid: int) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    if os.name == "nt":
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        kernel.OpenProcess.argtypes = [ctypes.c_ulong, ctypes.c_int, ctypes.c_ulong]
        kernel.GetExitCodeProcess.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_ulong)]
        kernel.CloseHandle.argtypes = [ctypes.c_void_p]
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return ctypes.get_last_error() == 5  # acesso negado: não assumir encerramento
        try:
            code = ctypes.c_ulong()
            return not kernel.GetExitCodeProcess(handle, ctypes.byref(code)) or code.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def active_run() -> dict | None:
    if not ACTIVE.exists():
        return None
    try:
        data = json.loads(ACTIVE.read_text(encoding="utf-8-sig"))
        output = Path(data["output_dir"]).resolve()
        if output.is_relative_to(ROOT / "results/arena") and (output / "summary.json").exists():
            return None
        return data if pid_alive(data.get("pid", 0)) else None
    except (ValueError, KeyError, OSError):
        # Lock ilegível não autoriza uma segunda arena por engano.
        return {"pid": None, "error": "Lock da arena ilegível; confira o processo antes de iniciar outro teste."}


def acquire(output_dir: Path) -> None:
    global _held
    ACTIVE.parent.mkdir(parents=True, exist_ok=True)
    if active_run():
        raise RuntimeError("Já há uma arena em andamento. Aguarde terminar para não disputar CPU.")
    handle = (ACTIVE.parent / "arena.lock").open("a+b")
    if handle.seek(0, 2) == 0:
        handle.write(b"0")
        handle.flush()
    handle.seek(0)
    try:
        if os.name == "nt":
            import msvcrt
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        handle.close()
        raise RuntimeError("Outra arena já reservou a máquina. Aguarde terminar.") from exc
    _held = handle
    atomic_json(ACTIVE, {"pid": os.getpid(), "output_dir": str(output_dir.resolve())})
    atexit.register(release)


def release() -> None:
    global _held
    try:
        data = json.loads(ACTIVE.read_text(encoding="utf8"))
        if data.get("pid") == os.getpid():
            ACTIVE.unlink(missing_ok=True)
    except (OSError, ValueError):
        pass
    if _held:
        _held.close()  # o SO libera o lock também em encerramento inesperado
        _held = None


def atomic_json(path: Path, value: dict) -> None:
    # A telemetria nunca deve transformar uma partida válida em derrota.
    try:
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf8")
        temporary.replace(path)
    except OSError:
        pass
