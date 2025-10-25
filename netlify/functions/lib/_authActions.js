// netlify/functions/lib/_authActions.js
const DEFAULT_PASSWORD = 'Metal@#357';

async function loginUser(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, helpers, requestBody) { // Changed last arg name
    // --- Add Logging ---
    console.log("Received raw login request body:", JSON.stringify(requestBody)); // Log raw body
    const { username, password } = requestBody || {}; // Destructure safely from the passed body
    console.log(`Extracted username: "${username}", password exists: ${password ? 'Yes' : 'No'}`); // Log extracted values
    // --- End Logging ---

    // Check extracted values
    if (!username || !password) {
        console.log("Validation failed inside loginUser: Username or password missing after destructuring."); // Add specific log
        return { statusCode: 400, body: JSON.stringify({ error: 'Username and password are required.' }) };
    }

    try {
        if (typeof helpers.findUserRow !== 'function') {
             console.error("findUserRow helper is missing!");
             throw new Error("Internal configuration error.");
        }
        const rowIndex = await helpers.findUserRow(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, username);

        if (rowIndex === -1) {
            console.log(`User "${username}" not found in sheet.`);
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }

        const range = `${USERS_SHEET_NAME}!B${rowIndex}`;
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: range,
        });
        const storedPassword = response.data.values?.[0]?.[0];

        if (!storedPassword) {
             console.error(`Password not found for user ${username} at row ${rowIndex}.`);
             return { statusCode: 500, body: JSON.stringify({ error: 'Authentication error. Contact admin.' }) };
        }

        if (String(password) === String(storedPassword)) {
            if (storedPassword === DEFAULT_PASSWORD) {
                console.log(`User ${username} logged in with default password. Change required.`);
                return { statusCode: 200, body: JSON.stringify({ success: true, changePasswordRequired: true }) };
            } else {
                console.log(`User ${username} logged in successfully.`);
                return { statusCode: 200, body: JSON.stringify({ success: true, changePasswordRequired: false }) };
            }
        } else {
            console.log(`Incorrect password attempt for user ${username}.`);
            return { statusCode: 401, body: JSON.stringify({ error: 'Incorrect password.' }) };
        }

    } catch (error) {
        console.error(`Error during login for ${username}:`, error);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred during login.', details: error.message }) };
    }
}


async function changePassword(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, helpers, requestBody) { // Changed last arg name
    // --- Add Logging ---
    console.log("Received raw changePassword request body:", JSON.stringify(requestBody));
    const { username, oldPassword, newPassword } = requestBody || {}; // Destructure safely
    console.log(`Extracted for changePassword - username: "${username}", oldPassword exists: ${oldPassword ? 'Yes' : 'No'}, newPassword exists: ${newPassword ? 'Yes' : 'No'}`);
    // --- End Logging ---

    // Check extracted values
    if (!username || !oldPassword || !newPassword) {
        console.log("Validation failed inside changePassword: Missing fields.");
        return { statusCode: 400, body: JSON.stringify({ error: 'Username, old password, and new password are required.' }) };
    }

    if (oldPassword !== DEFAULT_PASSWORD) {
        console.warn(`Attempt to change password for ${username} without using the default password as 'oldPassword'.`);
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request for password change.' }) };
    }
    if (newPassword === DEFAULT_PASSWORD) {
         return { statusCode: 400, body: JSON.stringify({ error: 'New password cannot be the default password.' }) };
    }
     if (newPassword.length < 6) {
          return { statusCode: 400, body: JSON.stringify({ error: 'New password must be at least 6 characters long.' }) };
     }

    try {
        if (typeof helpers.findUserRow !== 'function') {
             console.error("findUserRow helper is missing!");
             throw new Error("Internal configuration error.");
        }
        const rowIndex = await helpers.findUserRow(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, username);

        if (rowIndex === -1) {
             console.log(`User "${username}" not found for password change.`);
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }

        const rangeGet = `${USERS_SHEET_NAME}!B${rowIndex}`;
        const responseGet = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: rangeGet });
        const storedPassword = responseGet.data.values?.[0]?.[0];

        if (storedPassword !== DEFAULT_PASSWORD) {
            console.warn(`Attempt to change password for ${username} but stored password is not the default.`);
            return { statusCode: 403, body: JSON.stringify({ error: 'Password has already been changed from the default.' }) };
        }

        const rangeUpdate = `${USERS_SHEET_NAME}!B${rowIndex}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: rangeUpdate,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[newPassword]] }
        });

        console.log(`Password changed successfully for user ${username}.`);
        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Password changed successfully.' }) };

    } catch (error) {
        console.error(`Error changing password for ${username}:`, error);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred during password change.', details: error.message }) };
    }
}

module.exports = {
    loginUser,
    changePassword
};