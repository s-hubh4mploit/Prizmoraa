import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900 });

await page.goto('https://prizmoraa.vercel.app/', { waitUntil: 'networkidle0' });
const email = `qrtest-${Date.now()}@example.com`;
await page.evaluate(async (email) => {
  const res = await fetch('/api/auth/signup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'QR Test', email, password: 'testpass123' }),
  });
  const data = await res.json();
  localStorage.setItem('prizmoraa_auth_token', data.token);
  localStorage.setItem('prizmoraa_auth_user', JSON.stringify(data.user));
  localStorage.setItem('prizmoraa_cart_v1', JSON.stringify([{id:'brac-amora-heart-bracelet', name:'Amora Heart Bracelet', price: 899, image:'images/hero.jpg', qty:1}]));
}, email);

await page.goto('https://prizmoraa.vercel.app/checkout.html', { waitUntil: 'networkidle0' });
await page.waitForSelector('#cpPhone', { timeout: 8000 });
await page.$eval('#cpPhone', el => el.value = '');
await page.type('#cpPhone', '9999999999');
await page.$eval('#cpAddress', el => el.value = '');
await page.type('#cpAddress', '123 Test Street');
await page.$eval('#cpPincode', el => el.value = '');
await page.type('#cpPincode', '400001');
await page.click('#checkoutPagePayBtn');

await new Promise(r => setTimeout(r, 3500));
await page.screenshot({ path: 'scratch_razorpay_checkout.png' });
await browser.close();
console.log('done');
