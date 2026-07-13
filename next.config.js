/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfmake pulls in @foliojs-fork/pdfkit, which pulls in
  // @foliojs-fork/fontkit and @foliojs-fork/linebreak. Those read binary
  // Unicode `.trie` data files at runtime via
  // fs.readFileSync(path.join(__dirname, 'data.trie')). Next's webpack
  // build doesn't trace/copy that non-JS asset into .next/server/chunks,
  // which causes an ENOENT reading data.trie during the build's "collect
  // page data" step. Marking these packages external makes Next leave
  // them as plain require() calls resolved by Node directly from
  // node_modules at runtime, where the .trie files actually live.
  serverExternalPackages: [
    'pdfmake',
    '@foliojs-fork/pdfkit',
    '@foliojs-fork/fontkit',
    '@foliojs-fork/linebreak',
  ],
};

module.exports = nextConfig;
