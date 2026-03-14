import subprocess
import os
from pathlib import Path
from typing import Dict, List

def verify_signature_signtool(file_path: str) -> Dict[str, any]:
    """
    Verify digital signature using Windows signtool utility.
    
    Args:
        file_path: Path to the file to verify
        
    Returns:
        Dictionary with verification result and details
    """
    if not os.path.exists(file_path):
        return {"success": False, "error": f"File not found: {file_path}"}
    
    try:
        result = subprocess.run(
            ['signtool', 'verify', '/pa', '/v', file_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=10
        )
        
        output = result.stdout
        is_valid = "Successfully verified" in output
        
        return {
            "success": True,
            "file": file_path,
            "signed": is_valid,
            "output": output,
            "return_code": result.returncode
        }
    except FileNotFoundError:
        return {
            "success": False,
            "error": "signtool not found. Install Windows SDK to use signtool."
        }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Verification timeout"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def verify_system_files(system_paths: List[str] = None) -> List[Dict]:
    """
    Verify signatures of multiple system files.
    
    Args:
        system_paths: List of file paths. If None, checks common Windows system files.
        
    Returns:
        List of verification results
    """
    if system_paths is None:
        system_paths = [
            r"C:\Windows\System32\notepad.exe",
            r"C:\Windows\System32\cmd.exe",
            r"C:\Windows\explorer.exe",
        ]
    
    results = []
    for file_path in system_paths:
        result = verify_signature_signtool(file_path)
        results.append(result)
        print(f"\nFile: {file_path}")
        print(f"Signed: {'Yes' if result.get('signed') else 'No'}")
        if result.get('error'):
            print(f"Error: {result['error']}")
    
    return results


if __name__ == "__main__":
    # Test with common system files
    verify_system_files()
