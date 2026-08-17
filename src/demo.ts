import { reviewCode } from './llm.js';

const sampleFiles = [
  {
    filename: 'login.js',
    patch: `@@ -0,0 +1,6 @@
+function login(user, password) {
+  const query = "SELECT * FROM users WHERE name = '" + user + "'";
+  if (password == "admin123") {
+    return true;
+  }
+}`,
  },
];

const findings = await reviewCode(sampleFiles);
console.log(`\n🤖 Claude found ${findings.length} issue(s):\n`);
for (const f of findings) {
  console.log(`  [${f.severity}] ${f.file}${f.line ? ':' + f.line : ''}`);
  console.log(`     ${f.comment}\n`);
}
