from flask import Flask, render_template, request, jsonify
from datetime import datetime, timezone
import os

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(24))


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/search', methods=['POST'])
def search():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Request body must be JSON'}), 400

    query_type = data.get('type', '').lower().strip()
    query = data.get('query', '').strip()

    if not query:
        return jsonify({'error': 'Search query is required'}), 400

    if query_type not in ('email', 'phone', 'name'):
        return jsonify({'error': 'type must be one of: email, phone, name'}), 400

    try:
        if query_type == 'email':
            from modules.email_osint import EmailOSINT
            result = EmailOSINT(query).gather()
        elif query_type == 'phone':
            from modules.phone_osint import PhoneOSINT
            result = PhoneOSINT(query).gather()
        else:
            from modules.name_osint import NameOSINT
            result = NameOSINT(query).gather()

        result['meta'] = {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'query_type': query_type,
            'query': query,
        }
        return jsonify(result)

    except Exception as e:
        app.logger.exception('Search error')
        return jsonify({'error': f'Search failed: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
