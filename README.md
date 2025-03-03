# bsky-video-downloader

## Overview
**bsky-video-downloader** is a JavaScript tool that allows you to download videos that you have liked on **Bluesky**. It interacts with the **Bluesky API** to fetch and download videos while providing a progress bar for tracking downloads.

## Features
- Fetches liked videos from your Bluesky account.
- Downloads videos automatically to a local folder.
- Provides a CLI-based progress bar.
- Uses Axios for fast and efficient downloads.
- Supports authentication via the Bluesky API.

## Requirements
Ensure you have the following installed before using this script:
- **Node.js** (v14 or later recommended)
- **npm** or **yarn**

## Installation
1. Clone the repository or download the script.
   ```sh
   git clone https://github.com/yourusername/bsky-video-downloader.git](https://github.com/BragiHelvig/bsky_downloader.git
   cd bsky-video-downloader
   ```
2. Install required dependencies.
   ```sh
   npm install
   ```

## Usage
1. Run the script using Node.js:
   ```sh
   npm start
   ```
2. You will be prompted to enter your Bluesky credentials for authentication.
3. The script will fetch your liked videos and download them to the **downloads/** folder.

## Dependencies
This script relies on the following packages:
- `@atproto/api` - For interacting with the Bluesky API.
- `axios` - For handling video downloads.
- `fs` & `path` - For file system operations.
- `readline` - For CLI user input.
- `progress` - For displaying a progress bar.
- `child_process` & `util` - For executing shell commands asynchronously.

## License
This project is licensed under the **MIT License**. Feel free to modify and distribute it as needed.

## Contributing
If you would like to contribute:
1. Fork the repository.
2. Create a new branch (`feature-xyz`).
3. Make your changes and commit them.
4. Submit a pull request.

## Disclaimer
This tool is intended for personal use only. Ensure you comply with **Bluesky’s** terms of service when using this script.

