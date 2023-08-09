const promises = [];

async function waitAndLogPromise() {
  const p = (async() => {
    console.log('The promise is running');
    await new Promise((r) => setTimeout(r, 5000));
    console.log('The promise is completed');
  });
  let runningPromise = p();
  console.log('pushing p');
  promises.push(runningPromise);
  console.log('waiting for p');
  await runningPromise;
}

setTimeout(async () => {
  console.log('external pre. start');
  await Promise.all(promises);
  console.log('external pre. finished resolved');
}, 100)

setTimeout(async () => {
  console.log('external post. start');
  await Promise.all(promises);
  console.log('external post. finished resolved');
}, 8000)


console.log('waitAndLogPromise - start');
await waitAndLogPromise();
console.log('waitAndLogPromise - end');

