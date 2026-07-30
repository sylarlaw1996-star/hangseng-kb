const fs = require('fs');
const https = require('https');
const base = 'C:/Users/Administrator/hangseng-kb';

// Read full token from config file
const config = fs.readFileSync('C:/Users/Administrator/.config/fitch/github.env', 'utf8');
const TOKEN = config.replace('GITHUB_TOKEN=', '').trim();

console.log('Token length:', TOKEN.length);
console.log('First 15:', TOKEN.substring(0, 15));
console.log('Last 10:', TOKEN.substring(TOKEN.length - 10));

// Verify all ASCII
const allAscii = [...TOKEN].every(c => c.charCodeAt(0) <= 127);
console.log('All ASCII:', allAscii);
if (!allAscii || TOKEN.length !== 93) {
  console.error('INVALID TOKEN!');
  process.exit(1);
}

// === UPDATE FILES ===
['dashboard.html', 'admin.html'].forEach(f => {
  let content = fs.readFileSync(base + '/' + f, 'utf8');
  
  // The token strings in the files might have the correctly saved full token already
  // But let's replace whatever 'github...' pattern there is
  const matches = content.match(/'github_pat_[^']+'/g);
  if (matches) {
    matches.forEach(m => {
      content = content.replace(m, "'" + TOKEN + "'");
    });
    console.log(f + ': replaced ' + matches.length + ' old token(s)');
  }
  
  // Also check for any truncated token pattern (shorter than 93 chars)
  const shortMatches = content.match(/'github[^']{3,100}'/g);
  if (shortMatches) {
    shortMatches.forEach(m => {
      const inner = m.slice(1, -1);
      if (inner.length < 80) { // Not the full 93-char token
        content = content.replace(m, "'" + TOKEN + "'");
        console.log(f + ': replaced short token "' + inner.substring(0, 20) + '..."');
      }
    });
  }
  
  fs.writeFileSync(base + '/' + f, content, 'utf8');
  
  // Verify
  const verify = fs.readFileSync(base + '/' + f, 'utf8');
  if (verify.includes(TOKEN)) {
    console.log(f + ': ✅ verified, token present');
  } else {
    console.log(f + ': ❌ TOKEN NOT FOUND!');
  }
});

// === TEST API ===
console.log('\n=== Testing GitHub API ===');
function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      method, hostname: 'api.github.com', path,
      headers: {
        Authorization: '***' + TOKEN,
        'User-Agent': 'fitch',
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json'
      }
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(res.statusCode + ' ' + d.substring(0, 100)));
        else resolve(JSON.parse(d));
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const user = await api('GET', '/user');
    console.log('✅ User:', user.login);
    
    // Create a test issue
    const issue = await api('POST', '/repos/sylarlaw1996-star/hangseng-kb/issues', JSON.stringify({
      title: 'test message',
      body: 'test body',
      labels: ['gb-message']
    }));
    console.log('✅ Issue #' + issue.number + ' created successfully');
    
    // Close it
    await api('PATCH', '/repos/sylarlaw1996-star/hangseng-kb/issues/' + issue.number, JSON.stringify({state:'closed'}));
    console.log('✅ Test issue closed');
    
    console.log('\n🎉 ALL GOOD! API works with the full token.');
  } catch (e) {
    console.error('❌ API failed:', e.message);
    process.exit(1);
  }
})();
