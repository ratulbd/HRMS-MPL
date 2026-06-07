const axios = require('axios');

async function test() {
    try {
        console.log("Testing POST /api/auth/login...");
        const res = await axios.post('http://localhost:5000/api/auth/login', {
            username: 'admin',
            password: 'password123'
        });
        console.log("Status:", res.status);
        console.log("Data:", JSON.stringify(res.data, null, 2));
    } catch (err) {
        console.error("Error:", err.response ? err.response.status : err.message);
        if (err.response) console.error("Response:", err.response.data);
    }
}

test();
