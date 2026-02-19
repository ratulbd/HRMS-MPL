const axios = require('axios');

async function test() {
    try {
        const res = await axios.get('http://localhost:5000/api/employees?limit=1');
        const emp = res.data.employees[0];
        console.log('Employee Data:', JSON.stringify(emp, null, 2));
        if (emp && emp.id && !emp._id) {
            console.log('SUCCESS: "id" is present and "_id" is removed (or hidden).');
        } else if (emp && emp.id) {
            console.log('SUCCESS: "id" is present.');
        } else {
            console.log('FAILURE: "id" is MISSING.');
        }
    } catch (err) {
        console.error('Error:', err.message);
    }
}
test();
