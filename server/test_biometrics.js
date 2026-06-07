const { verifyBiometrics } = require('./utils/biometricMatchEngine');
const path = require('path');

async function test() {
    // Assuming we have EMP001 reference image
    const ref = 'uploads/biometrics/EMP001-bioref.jpg';
    const checkin = 'uploads/biometrics/EMP001-bioref.jpg';
    
    console.log('Testing biometric match engine...');
    const result = await verifyBiometrics('EMP001', ref, checkin);
    console.log('Result:', result);
}

test().catch(console.error);
