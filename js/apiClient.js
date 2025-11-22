// js/apiClient.js
import { showLoading, hideLoading } from './utils.js';

const API_URL = '/api/proxy'; // Adjust if your proxy endpoint is different

// === MODIFICATION: apiCall is EXPORTED ===
export async function apiCall(action, method = 'GET', body = null, params = null) {
    showLoading();
    try {
        const options = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
        };

        let url = `${API_URL}?action=${action}`;

        if (method === 'GET' && params) {
            // Build query string from params object
            const query = new URLSearchParams(params).toString();
            url += `&${query}`;
        }

        if (method === 'POST' && body) {
            options.body = JSON.stringify(body);
        }

        console.log(`API Call: ${method} ${url}`, body ? JSON.stringify(body).substring(0, 100) + '...' : ''); // Log truncated body

        const response = await fetch(url, options);
        const responseText = await response.text();

        if (!response.ok) {
            let errorData = { error: `HTTP error! status: ${response.status}`, details: responseText };
            try {
                 const jsonError = JSON.parse(responseText);
                 if (jsonError.error || jsonError.details) errorData = jsonError;
            } catch (e) { /* Ignore JSON parse error if response wasn't JSON */ }
            console.error("API Error Response:", errorData);
            // Try to extract a meaningful message
            let message = errorData.error || `HTTP error! status: ${response.status}`;
            if(errorData.details && typeof errorData.details === 'string' && errorData.details.length < 200) {
                 message += ` - ${errorData.details}`;
            }
             if (errorData.message) { // Sometimes the error is nested
                 message = errorData.message;
             }
            throw new Error(message);
        }

        if (!responseText) {
             console.log(`API Success (${action}): No content`);
             return { success: true }; // Indicate success for empty responses
        }

         try {
             const data = JSON.parse(responseText);
             console.log(`API Success (${action}):`, data);
             return data;
         } catch (e) {
              console.error(`API Error (${action}): Failed to parse successful JSON response:`, responseText, e);
             throw new Error("Failed to parse server response.");
         }

    } catch (error) {
        console.error(`API Call Error (${action}):`, error);
        // Ensure the error message is useful
        throw new Error(error.message || 'An unknown API error occurred.');
    } finally {
         hideLoading();
    }
}
// === END MODIFICATION ===