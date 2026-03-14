import subprocess
import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple
import json
from datetime import datetime

class SystemFileSignatureVerifier:
    """Verifies digital signatures of system files."""
    
    def __init__(self, verbose: bool = True):
        self.verbose = verbose
        self.results = []
    
    def verify_file(self, file_path: str) -> Dict:
        """Verify a single file's signature."""
        if not os.path.exists(file_path):
            return {
                "file": file_path,
                "status": "ERROR",
                "message": "File not found"
            }
        
        try:
            result = subprocess.run(
                ['signtool', 'verify', '/pa', '/v', file_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                timeout=10
            )
            
            output = result.stdout
            is_signed = "Successfully verified" in output
            
            return {
                "file": file_path,
                "status": "SIGNED" if is_signed else "NOT_SIGNED",
                "return_code": result.returncode,
                "details": output if self.verbose else None
            }
        except FileNotFoundError:
            return {
                "file": file_path,
                "status": "ERROR",
                "message": "signtool not found"
            }
        except Exception as e:
            return {
                "file": file_path,
                "status": "ERROR",
                "message": str(e)
            }
    
    def verify_directory(self, directory: str, extensions: Tuple[str] = ('.exe', '.dll', '.sys')) -> List[Dict]:
        """Verify all files with given extensions in a directory."""
        results = []
        
        try:
            for ext in extensions:
                for file_path in Path(directory).glob(f'*{ext}'):
                    if self.verbose:
                        print(f"Checking: {file_path}")
                    result = self.verify_file(str(file_path))
                    results.append(result)
        except Exception as e:
            print(f"Error scanning directory: {e}")
        
        return results
    
    def generate_report(self, results: List[Dict], output_file: str = None):
        """Generate a report of verification results."""
        summary = {
            "timestamp": datetime.now().isoformat(),
            "total_files": len(results),
            "signed": sum(1 for r in results if r.get("status") == "SIGNED"),
            "not_signed": sum(1 for r in results if r.get("status") == "NOT_SIGNED"),
            "errors": sum(1 for r in results if r.get("status") == "ERROR"),
            "results": results
        }
        
        if output_file:
            with open(output_file, 'w') as f:
                json.dump(summary, f, indent=2)
            print(f"Report saved to: {output_file}")
        
        return summary


def main():
    """Main function demonstrating usage."""
    verifier = SystemFileSignatureVerifier(verbose=True)
    
    # Verify common system files
    system_files = [
        r"C:\Windows\System32\notepad.exe",
        r"C:\Windows\System32\cmd.exe",
        r"C:\Windows\System32\svchost.exe",
        r"C:\Windows\explorer.exe",
    ]
    
    print("=" * 60)
    print("System File Digital Signature Verifier")
    print("=" * 60)
    
    for file_path in system_files:
        result = verifier.verify_file(file_path)
        print(f"\nFile: {result['file']}")
        print(f"Status: {result['status']}")
        if result.get('message'):
            print(f"Message: {result['message']}")
    
    # Or verify entire directory
    # results = verifier.verify_directory(r"C:\Windows\System32", extensions=('.exe',))
    # report = verifier.generate_report(results, "signature_report.json")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
