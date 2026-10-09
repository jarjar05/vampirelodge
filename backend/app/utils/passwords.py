from pwdlib import PasswordHash

_password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """Return a one-way Argon2 password hash; never persist the raw password."""
    if not password:
        raise ValueError("Password must not be empty")
    return _password_hash.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    """Check a password against its stored one-way hash."""
    return _password_hash.verify(password, password_hash)