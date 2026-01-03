import os
import subprocess
from pathlib import Path


def main():
    base_dir = Path(__file__).resolve().parents[1]
    migrations_dir = base_dir / "migrations"
    env_db_url = os.environ.get("DATABASE_URL", "").strip()
    if not env_db_url:
        raise RuntimeError("DATABASE_URL is required to run migrations.")

    sql_files = sorted(migrations_dir.glob("*.sql"))
    if not sql_files:
        print("No SQL migrations found.")
        return

    print(f"Applying migrations to {env_db_url}")
    for sql_file in sql_files:
        print(f"Running {sql_file.name}")
        subprocess.check_call(
            ["psql", env_db_url, "-f", str(sql_file)],
        )


if __name__ == "__main__":
    main()

