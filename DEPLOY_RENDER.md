# Deploy DATAGS on Render Free

1. Push this project to a private GitHub repository. Keep `.env`, `.env.*` and `credentials.json` out of Git. Never commit real passwords or API keys.
2. In Render, choose **New + > Blueprint** and select the repository. Render will read `render.yaml`.
3. Set these secret environment variables when prompted:
   - `MONGO_URI`: MongoDB Atlas connection string. Allow `0.0.0.0/0` in Atlas Network Access for Render.
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD`
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_CREDENTIALS_JSON`: the complete JSON contents of the Google service-account key.
4. Share the `GS-DONHANG` spreadsheet with the service-account email as Editor if Sheet sync is needed.
5. Deploy. The public URL will be similar to `https://datags-orders.onrender.com`.

The free service sleeps after inactivity, so the first request after idle may take several seconds. MongoDB Atlas remains the persistent database.
