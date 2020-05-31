function decode(buffer) {
  const sequences = [];
  let startIndex = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0x26) {
      sequences.push(buffer.subarray(startIndex, i));
      startIndex = i + 1;
    }
    if (i === buffer.length - 1) {
      sequences.push(buffer.subarray(startIndex, i));
    }
  }
  console.log(buffer);
  console.log(sequences);
  /** @type {[string, string][]} */
  const output = [];
  sequences.forEach((bytes) => {
    if (!bytes.length) return;

    // Find 0x3D and replace 0x2B in one loop for better performance
    let indexOf0x3D = -1;
    for (let i = 0; i < bytes.length; i += 1) {
      switch (bytes[i]) {
        case 0x3D:
          if (indexOf0x3D === -1) {
            indexOf0x3D = i;
          }
          break;
        case 0x2B:
          bytes[i] = 0x20;
          break;
        default:
      }
    }
    let name;
    let value;
    if (indexOf0x3D === -1) {
      name = bytes;
      value = bytes.subarray(bytes.length, 0);
    } else {
      name = bytes.subarray(0, indexOf0x3D);
      value = bytes.subarray(indexOf0x3D + 1);
    }
    const nameString = decodeURIComponent(name.toString('utf-8'));
    const valueString = decodeURIComponent(value.toString('utf-8'));
    output.push([nameString, valueString]);
  });
  return output;
}

console.log(decode(Buffer.from('field1=Ƣvalue1&field2=value2&&&=&==')));
