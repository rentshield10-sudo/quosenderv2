async function run() {
  try {
    const phoneNumberId = process.env.OPENPHONE_TEST_PHONE_NUMBER_ID || 'PNxxxxxxxxxx';
    const participants = encodeURIComponent(process.env.OPENPHONE_TEST_PARTICIPANTS || '+10000000000');
    const apiToken = process.env.OPENPHONE_API_KEY || 'replace-with-api-key';
    const url1 = `https://api.openphone.com/v1/messages?phoneNumberId=${phoneNumberId}&participants=${participants}&limit=2`;
    const res1 = await fetch(url1, { headers: { Authorization: apiToken }});
    console.log(await res1.text());
  } catch (err: any) {}
}
run();
