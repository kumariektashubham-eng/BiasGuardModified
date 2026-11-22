import sys
import io
import logging

def reconfigure_standard_streams():
    """
    Ensures sys.stdout and sys.stderr handle encoding errors safely without crashing.
    On Windows with cp1252 code page or redirected stdout/stderr, setting errors='replace'
    prevents UnicodeEncodeError from ever interrupting in-flight requests.
    """
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                try:
                    stream.reconfigure(errors="replace")
                except Exception:
                    pass

# Ensure standard streams are protected on module import
reconfigure_standard_streams()

class SafeStreamHandler(logging.StreamHandler):
    """
    StreamHandler that guarantees an unencodable character in a log message
    will never raise UnicodeEncodeError or crash an in-flight HTTP request.
    If the underlying stream cannot encode a character, it formats with ASCII replacement.
    """
    def emit(self, record):
        try:
            msg = self.format(record)
            stream = self.stream
            try:
                stream.write(msg + self.terminator)
            except UnicodeEncodeError:
                safe_msg = msg.encode("ascii", errors="replace").decode("ascii")
                stream.write(safe_msg + self.terminator)
            self.flush()
        except Exception:
            try:
                self.handleError(record)
            except Exception:
                pass

def safe_print(*args, **kwargs):
    """
    Drop-in print wrapper that catches UnicodeEncodeError and prints ASCII-safe fallback.
    Never crashes an active request.
    """
    try:
        print(*args, **kwargs)
    except UnicodeEncodeError:
        try:
            safe_args = [
                arg.encode("ascii", errors="replace").decode("ascii") if isinstance(arg, str) else arg
                for arg in args
            ]
            print(*safe_args, **kwargs)
        except Exception:
            pass

def configure_safe_logging(level=logging.INFO):
    """
    Configures root logging with SafeStreamHandler and UTF-8 encoding support.
    Configures any existing handlers to not crash on UnicodeEncodeError.
    """
    reconfigure_standard_streams()

    root_logger = logging.getLogger()
    root_logger.setLevel(level)

    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")

    # If handlers already exist, replace or wrap them with SafeStreamHandler
    for handler in list(root_logger.handlers):
        if isinstance(handler, logging.FileHandler):
            # Ensure FileHandler uses utf-8 with errors replace
            try:
                if getattr(handler, "encoding", None) != "utf-8":
                    handler.encoding = "utf-8"
            except Exception:
                pass
        elif isinstance(handler, logging.StreamHandler):
            root_logger.removeHandler(handler)

    handler = SafeStreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)
    return root_logger
