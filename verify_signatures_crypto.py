from cryptography import x509
from cryptography.hazmat.backends import default_backend
import subprocess
import os

def extract_certificate_info(file_path: str) -> Dict:
    """
    Extract certificate information from a signed file.
    Uses osslsigncode to extract the certificate.
    """
    if not os.path.exists(file_path):
        return {"error": f"File not found: {file_path}"}
    
    try:
        # Extract signature
        result = subprocess.run(
            ['osslsigncode', 'extract-signature', '-in', file_path, '-out', 'temp.sig'],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True
        )
        
        if result.returncode != 0:
            return {"error": "Failed to extract signature"}
        
        # Parse certificate
        with open('temp.sig', 'rb') as f:
            cert_data = f.read()
        
        cert = x509.load_der_x509_certificate(cert_data, default_backend())
        
        info = {
            "subject": str(cert.subject),
            "issuer": str(cert.issuer),
            "valid_from": cert.not_valid_before,
            "valid_until": cert.not_valid_after,
            "serial_number": cert.serial_number
        }
        
        # Cleanup
        os.remove('temp.sig')
        
        return info
    except Exception as e:
        return {"error": str(e)}
