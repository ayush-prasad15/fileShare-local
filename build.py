import os
import subprocess
import shutil
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
FRONTEND_OUT = os.path.join(FRONTEND_DIR, "out")
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
STATIC_DIR = os.path.join(BACKEND_DIR, "static")

def run_cmd(cmd, cwd=None):
    print(f"Running: {cmd}")
    subprocess.run(cmd, cwd=cwd, shell=True, check=True)

def build():
    print("=== Building Frontend ===")
    if os.path.exists(STATIC_DIR):
        shutil.rmtree(STATIC_DIR)
        
    run_cmd("npm run build", cwd=FRONTEND_DIR)
    
    print("\n=== Copying Static Files ===")
    if os.path.exists(FRONTEND_OUT):
        shutil.copytree(FRONTEND_OUT, STATIC_DIR)
    else:
        print("Error: Next.js build output not found!")
        sys.exit(1)
    
    print("\n=== Installing PyInstaller ===")
    pip_cmd = os.path.join(BACKEND_DIR, "venv", "Scripts", "pip") if os.name == "nt" else os.path.join(BACKEND_DIR, "venv", "bin", "pip")
    if not os.path.exists(pip_cmd):
        pip_cmd = "pip"
        
    run_cmd(f"{pip_cmd} install pyinstaller", cwd=BACKEND_DIR)
    
    print("\n=== Packaging Backend ===")
    pyinstaller_cmd = os.path.join(BACKEND_DIR, "venv", "Scripts", "pyinstaller") if os.name == "nt" else os.path.join(BACKEND_DIR, "venv", "bin", "pyinstaller")
    if not os.path.exists(pyinstaller_cmd):
        pyinstaller_cmd = "pyinstaller"
        
    run_cmd(f"{pyinstaller_cmd} pyinstaller.spec --clean", cwd=BACKEND_DIR)
    
    print("\n=== Build Complete ===")
    print(f"Executable is located in {os.path.join(BACKEND_DIR, 'dist')}")

if __name__ == "__main__":
    build()
