import os
from flask import Flask, request, jsonify
from flask_cors import CORS # type: ignore
import pycountry
import phonenumbers
import json

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Caching country information for performance
class CountryCodeValidator:
    def __init__(self):
        self._country_cache = None
    
    def get_country_data(self):
        if self._country_cache is None:
            self._country_cache = self._build_country_data()
        return self._country_cache
    
    def _build_country_data(self):
        country_data = []
        for country in pycountry.countries:
            try:
                # Get phone code using phonenumbers
                phone_code = phonenumbers.country_code_for_region(country.alpha_2)
                
                # Some countries might not have a valid phone code
                if phone_code > 0:
                    country_data.append({
                        'name': country.name,
                        'alpha2': country.alpha_2,
                        'alpha3': country.alpha_3,
                        'phone_code': f'+{phone_code}',
                        'continent': self._get_continent(country.alpha_2)
                    })
            except Exception:
                pass
        return country_data
    
    def _get_continent(self, country_code):
        # Expanded continent mapping
        continent_mapping = {
            'NA': ['US', 'CA', 'MX'],
            'EU': ['GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'BE', 'CH'],
            'AS': ['CN', 'JP', 'IN', 'KR', 'SG', 'TH', 'MY'],
            'AF': ['ZA', 'EG', 'NG', 'KE', 'MA'],
            'OC': ['AU', 'NZ', 'FJ', 'PG'],
            'SA': ['BR', 'AR', 'CO', 'CL', 'PE']
        }
        
        for continent, countries in continent_mapping.items():
            if country_code in countries:
                return continent
        return 'Unknown'
    
    def validate_country_code(self, code):
        try:
            # Remove '+' if present and strip whitespace
            code = code.lstrip('+').strip().upper()
            
            # Try validation through pycountry
            try:
                # First try alpha-2 code directly
                country = pycountry.countries.get(alpha_2=code)
            except:
                # If alpha-2 fails, try alpha-3 code
                try:
                    country = pycountry.countries.get(alpha_3=code)
                except:
                    return {'isValid': False, 'error': 'Country code not found'}
            
            # Additional validation using phonenumbers
            try:
                # Get country code for the region
                phone_code = phonenumbers.country_code_for_region(country.alpha_2)
                
                return {
                    'isValid': True,
                    'countryName': country.name,
                    'alpha2Code': country.alpha_2,
                    'alpha3Code': country.alpha_3,
                    'phoneCode': f'+{phone_code}',
                    'continent': self._get_continent(country.alpha_2)
                }
            
            except Exception as e:
                # If phonenumbers validation fails, still return country info
                return {
                    'isValid': True,
                    'countryName': country.name,
                    'alpha2Code': country.alpha_2,
                    'alpha3Code': country.alpha_3,
                    'phoneCode': 'Unknown',
                    'continent': self._get_continent(country.alpha_2)
                }
        
        except Exception as e:
            return {'isValid': False, 'error': str(e)}

# Initialize validator
country_validator = CountryCodeValidator()

# Routes

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'status': 'ok',
        'message': 'Country Code Service is running',
        'available_routes': [
            '/validate-country-code',
            '/list-country-codes',
            '/random-country-code'
        ]
    }), 200

@app.route('/validate-country-code', methods=['GET'])
def validate_code():
    code = request.args.get('code', '').upper()
    if not code:
        return jsonify({'isValid': False, 'error': 'No country code provided'}), 400
    
    result = country_validator.validate_country_code(code)
    return jsonify(result)

@app.route('/list-country-codes', methods=['GET'])
def list_country_codes():
    countries = country_validator.get_country_data()
    
    # Optional filtering
    continent = request.args.get('continent')
    if continent:
        countries = [c for c in countries if c['continent'] == continent.upper()]
    
    return jsonify(countries)

@app.route('/random-country-code', methods=['GET'])
def random_country_code():
    import random
    countries = country_validator.get_country_data()
    random_country = random.choice(countries)
    return jsonify(random_country)

# Error handler
@app.errorhandler(Exception)
def handle_error(error):
    response = {
        'error': str(error),
        'message': 'An unexpected error occurred'
    }
    return jsonify(response), 500

if __name__ == '__main__':
    app.run(port=5000, debug=True)