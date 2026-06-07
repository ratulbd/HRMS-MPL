const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const API_KEY = process.env.FACEPLUSPLUS_API_KEY;
const API_SECRET = process.env.FACEPLUSPLUS_API_SECRET;
const COMPARE_URL = 'https://api-us.faceplusplus.com/facepp/v3/compare';

/**
 * Biometric Match Engine (Face++ Cloud API)
 * Compares a check-in selfie against a registered biometric reference selfie.
 */
async function verifyBiometrics(employeeId, referencePath, checkInPath, options = {}) {
    console.log(`\n[Biometric Engine] ===== Starting Biometric Scan for ${employeeId} =====`);
    
    try {
        const absRefPath = path.resolve(__dirname, '..', referencePath);
        const absCheckInPath = path.resolve(__dirname, '..', checkInPath);

        if (!fs.existsSync(absRefPath)) {
            throw new Error(`Reference image not found at ${absRefPath}`);
        }
        if (!fs.existsSync(absCheckInPath)) {
            throw new Error(`Check-in image not found at ${absCheckInPath}`);
        }

        console.log(`[Biometric Engine] Uploading images to Face++ API...`);
        const form = new FormData();
        form.append('api_key', API_KEY);
        form.append('api_secret', API_SECRET);
        form.append('image_file1', fs.createReadStream(absRefPath));
        form.append('image_file2', fs.createReadStream(absCheckInPath));

        const response = await axios.post(COMPARE_URL, form, {
            headers: {
                ...form.getHeaders()
            }
        });

        const data = response.data;

        if (data.error_message) {
            throw new Error(data.error_message);
        }

        const confidence = data.confidence;
        // Use the standard 1e-4 false acceptance rate threshold
        const threshold = data.thresholds ? data.thresholds['1e-4'] : 69.0; 
        
        // Face++ returns 0 if no faces were found
        if (confidence === undefined || confidence === null) {
            return {
                success: false,
                confidence: 0,
                error: "No face detected in the photo. Please ensure good lighting."
            };
        }

        // Apply test mismatch override if developer requested it
        if (options.testMismatch) {
            console.log(`[Biometric Engine] * TEST MISMATCH OVERRIDE TRIGGERED *`);
            return {
                success: false,
                confidence: 25.0,
                error: "Simulated mismatch failure."
            };
        }

        const isMatch = confidence >= threshold;

        console.log(`[Biometric Engine]    - Face++ Confidence: ${confidence}%`);
        console.log(`[Biometric Engine]    - Required Threshold: ${threshold}%`);

        if (isMatch) {
            console.log(`[Biometric Engine] ===== DECISION: MATCH APPROVED =====\n`);
            return {
                success: true,
                confidence: confidence,
                details: { distance: confidence } // Used distance to stay compatible with previous model logs
            };
        } else {
            console.log(`[Biometric Engine] ===== DECISION: MATCH REJECTED =====\n`);
            return {
                success: false,
                confidence: confidence,
                error: "Facial patterns do not match the registered user."
            };
        }

    } catch (error) {
        // Handle Face++ specific concurrency errors (CONCURRENCY_LIMIT_EXCEEDED)
        if (error.response && error.response.data && error.response.data.error_message) {
            const errCode = error.response.data.error_message;
            console.error(`[Biometric Engine] Face++ API Error:`, errCode);
            
            if (errCode === 'CONCURRENCY_LIMIT_EXCEEDED') {
                return {
                    success: false,
                    confidence: 0,
                    error: "Server is busy verifying another employee. Please wait 2 seconds and try again."
                };
            }
            return {
                success: false,
                confidence: 0,
                error: "Biometric API Error: " + errCode
            };
        }

        console.error(`[Biometric Engine] Fatal Error:`, error.message);
        return {
            success: false,
            confidence: 0,
            error: "Biometric processing failed. " + error.message
        };
    }
}

module.exports = {
    verifyBiometrics
};
