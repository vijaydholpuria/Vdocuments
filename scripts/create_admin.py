#!/usr/bin/env python
"""
Create the first (or an additional) admin account in Supabase.

Usage:
    python scripts/create_admin.py

Prompts for an email and password, hashes the password with Werkzeug,
and inserts the row into the `admins` table. The plaintext password is
never displayed, logged, or stored.
"""
import os
import sys
import getpass

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from models.admin import Admin
from utils.security import strong_enough_password


def main():
    print("=== V Doc — Create Admin Account ===\n")

    email = input("Email: ").strip().lower()
    if not email or "@" not in email:
        print("A valid email address is required.")
        sys.exit(1)

    if Admin.get_by_email(email):
        print(f"An admin with the email '{email}' already exists.")
        sys.exit(1)

    password = getpass.getpass("Password: ")
    confirm = getpass.getpass("Confirm password: ")

    if password != confirm:
        print("Passwords do not match.")
        sys.exit(1)

    if not strong_enough_password(password):
        print("Password must be at least 6 characters.")
        sys.exit(1)

    Admin.create(email, password)
    print(f"\nAdmin account created for {email}. You can now log in at /login.")


if __name__ == "__main__":
    main()
