import os

from app import create_app

# Use the real application factory (same as `flask run`)
app = create_app()


# Run the app
if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    debug = os.environ.get("FLASK_DEBUG", "1") not in ("0", "false", "False")
    app.run(host="0.0.0.0", port=port, debug=debug)
