# HRMS Server Hosting Guide (Cloudflare Tunnels)

This guide explains how to expose your local Node.js HRMS server and MongoDB to the internet securely and for free using Cloudflare Tunnels. 

Since MongoDB runs locally on the server, it will remain safely completely hidden from the internet. We are only exposing the Node.js API (Port 5000).

## Prerequisites
1. Access to the Server PC (Administrator privileges).
2. The Node.js server (`npm run dev` or `npm start`) running on Port `5000`.
3. A free [Cloudflare Account](https://dash.cloudflare.com/sign-up).
4. *Highly Recommended:* A custom domain name added to Cloudflare (e.g., `mycompany.com`).

---

## Step-by-Step Setup

### Step 1: Create a Tunnel in Cloudflare Zero Trust
1. Log in to your Cloudflare Dashboard at [dash.cloudflare.com](https://dash.cloudflare.com).
2. On the left sidebar, click on **Zero Trust**. (You may need to quickly set up a free Zero Trust team name if this is your first time).
3. In the Zero Trust dashboard, go to **Networks** -> **Tunnels** on the left menu.
4. Click the **Create a tunnel** button.
5. Select **Cloudflared** as the connector type and click **Next**.
6. Name your tunnel something recognizable, like `HRMS-Server`, and click **Save tunnel**.

### Step 2: Install Cloudflared on the Server PC
Cloudflare will now show you a page with installation instructions for different Operating Systems.
1. On the **Server PC**, open **PowerShell** as an **Administrator** (Right-click Start -> Windows PowerShell (Admin)).
2. On the Cloudflare page, select **Windows** as the environment.
3. Cloudflare will provide a command that looks something like this:
   ```powershell
   winget install --id Cloudflare.cloudflared; cloudflared service install eyJh...[long token string]...
   ```
4. Copy that exact command from the dashboard and paste it into the PowerShell window on your Server PC. Press **Enter**.
5. Wait for the installation to finish. In the Cloudflare Dashboard, you should see a "Connector" appear with a status of **Connected** at the bottom of the page.
6. Click **Next**.

### Step 3: Route Traffic to your Node.js Server
Now you need to tell Cloudflare where to send the internet traffic.

1. You will be on the **Route traffic** page.
2. Under **Public Hostnames**, configure the following:
   - **Subdomain:** e.g., `hrms` or `api`
   - **Domain:** Select your domain from the dropdown (e.g., `yourcompany.com`).
   - *This will make your API URL: `https://hrms.yourcompany.com`*
3. Under **Service**, configure the following:
   - **Type:** `HTTP`
   - **URL:** `localhost:5000`
4. Click **Save tunnel**.

*Congratulations! Your server is now securely online.*

---

## Step 4: Update the Mobile App

Now that your server has a public, secure HTTPS URL (e.g., `https://hrms.yourcompany.com`), you need to update the mobile app so it talks to the internet instead of your local Wi-Fi.

1. Open `js/mobile_app.js` in your project.
2. Find the API Base URL setting. If you are using `localStorage` for it, you can just update it in the Developer Settings within the app.
3. Change the URL from `http://192.168.X.X:5000` to your new secure URL:
   `https://hrms.yourcompany.com` (Make sure not to put a trailing slash `/` if your code doesn't expect it).
4. Rebuild your Android app using Capacitor:
   ```bash
   npx cap sync android
   npx cap copy android
   ```
5. Build the new APK via Android Studio and install it on the employee phones.

## Step 5: Database Backups
Since you are hosting the MongoDB database locally, you are responsible for backups! 
Ensure you regularly back up the server PC, or write a script to back up the MongoDB `hrms` database to a cloud drive like Google Drive or Dropbox to prevent data loss in case of hardware failure.
