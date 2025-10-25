// netlify/functions/lib/_authActions.js
const DEFAULT_PASSWORD = 'Metal@#357'; // Declare only ONCE at the top

async function loginUser(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, helpers, { username, password }) {
    if (!username || !password) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Username and password are required.' }) };
    }

    try {
        // Ensure findUserRow is available in helpers
        if (typeof helpers.findUserRow !== 'function') {
             console.error("findUserRow helper is missing!");
             throw new Error("Internal configuration error.");
        }
        const rowIndex = await helpers.findUserRow(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, username);

        if (rowIndex === -1) {
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


async function changePassword(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, helpers, { username, oldPassword, newPassword }) {
    if (!username || !oldPassword || !newPassword) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Username, old password, and new password are required.' }) };
    }

    // Security check: Only allow changing FROM the default password via this specific action
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
         // Ensure findUserRow is available in helpers
        if (typeof helpers.findUserRow !== 'function') {
             console.error("findUserRow helper is missing!");
             throw new Error("Internal configuration error.");
        }
        const rowIndex = await helpers.findUserRow(sheets, SPREADSHEET_ID, USERS_SHEET_NAME, username);

        if (rowIndex === -1) {
            return { statusCode: 404, body: JSON.stringify({ error: 'User not found.' }) };
        }

        // Verify the current password IS the default password before updating
        const rangeGet = `${USERS_SHEET_NAME}!B${rowIndex}`;
        const responseGet = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: rangeGet });
        const storedPassword = responseGet.data.values?.[0]?.[0];

        if (storedPassword !== DEFAULT_PASSWORD) {
            console.warn(`Attempt to change password for ${username} but stored password is not the default.`);
            return { statusCode: 403, body: JSON.stringify({ error: 'Password has already been changed from the default.' }) };
        }

        // Update the password in column B
        const rangeUpdate = `${USERS_SHEET_NAME}!B${rowIndex}`;
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: rangeUpdate,
            valueInputOption: 'USER_ENTERED', // Or 'RAW'
            resource: { values: [[newPassword]] }
        });

        console.log(`Password changed successfully for user ${username}.`);
        return { statusCode: 200, body: JSON.stringify({ success: true, message: 'Password changed successfully.' }) };

    } catch (error) {
        console.error(`Error changing password for ${username}:`, error);
        return { statusCode: 500, body: JSON.stringify({ error: 'An internal server error occurred during password change.', details: error.message }) };
    }
}

// Export BOTH functions in ONE module.exports block at the END
module.exports = {
    loginUser,
    changePassword
};