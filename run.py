from app import create_app

app = create_app()

if __name__ == '__main__':
    # Default port from previous config or standard 18800 as in README
    app.run(host='0.0.0.0', port=18800, debug=True)
