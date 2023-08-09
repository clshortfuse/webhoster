/**
 *
 * @param buffer
 */
function decode(buffer) {
  const sequences = [];
  let startIndex = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0x26) {
      sequences.push(buffer.subarray(startIndex, index));
      startIndex = index + 1;
    }
    if (index === buffer.length - 1) {
      sequences.push(buffer.subarray(startIndex, index));
    }
  }
  console.log(buffer);
  console.log(sequences);
  /** @type {[string, string][]} */
  const output = [];
  for (const bytes of sequences) {
    if (!bytes.length) continue;

    // Find 0x3D and replace 0x2B in one loop for better performance
    let indexOf0x3D = -1;
    for (let index = 0; index < bytes.length; index += 1) {
      switch (bytes[index]) {
        case 0x3D:
          if (indexOf0x3D === -1) {
            indexOf0x3D = index;
          }
          break;
        case 0x2B:
          bytes[index] = 0x20;
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
  }
  return output;
}

console.log(decode(Buffer.from('field1=Ƣvalue1&field2=value2&&&=&==')));
