import requests

def make_call():
    # Construct the URL for the API request
    player_id = "DankAxon-3198"
    url = f"https://overfast-api.tekrop.fr/players/{player_id}"
    try:
        # Make a GET request to the API
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for HTTP errors

        # Parse the JSON response
        data = response.json()

        # print the raw data
        print(data)

    except requests.exceptions.RequestException as e:
        print(f"Error: {e}")

# Search for a player by username
make_call()