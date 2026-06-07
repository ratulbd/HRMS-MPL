const dns = require('dns');

const host = '_mongodb._tcp.cluster0.fy40xnm.mongodb.net';

console.log(`Resolving SRV records for ${host}...`);

dns.resolveSrv(host, (err, addresses) => {
    if (err) {
        console.error('DNS Resolution Error:', err.message);
        if (err.code) console.error('Error Code:', err.code);
        return;
    }
    console.log('SRV Records Resolved Successfully:');
    console.log(addresses);
});
