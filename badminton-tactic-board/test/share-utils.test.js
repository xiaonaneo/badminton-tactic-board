const assert = require('node:assert/strict');
const share = require('../share-utils.js');

const fakeFile = { name: 'badminton-tactic.png', type: 'image/png' };

assert.deepEqual(share.buildShareData(fakeFile), {
  files: [fakeFile],
  title: '羽毛球战术板',
  text: '羽毛球战术图',
});

const accepted = {
  share() {},
  canShare(data) { return data.files.length === 1; },
};
assert.equal(share.canShareFiles(accepted, share.buildShareData(fakeFile)), true);

const rejected = {
  share() {},
  canShare() { return false; },
};
assert.equal(share.canShareFiles(rejected, share.buildShareData(fakeFile)), false);

let clipboardWrites = 0;
class FakeClipboardItem {
  constructor(value) { this.value = value; }
}
const clipboardNavigator = {
  clipboard: {
    write(items) {
      clipboardWrites += 1;
      assert.equal(items[0].value['image/png'], 'blob');
      return Promise.resolve();
    },
  },
};

share.copyImageToClipboard(clipboardNavigator, 'blob', FakeClipboardItem).then(function (copied) {
  assert.equal(copied, true);
  assert.equal(clipboardWrites, 1);
});
