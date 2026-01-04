import sys
import subprocess

def main() -> int:
    cmd = [sys.executable, "-m", "pytest", "-q"]
    print("Running:", " ".join(cmd))
    return subprocess.call(cmd)

if __name__ == "__main__":
    raise SystemExit(main())

