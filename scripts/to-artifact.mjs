// Turns dist-single/index.html into a page fragment for Claude Artifacts (the host adds the
// doctype/head/body skeleton): title and font links first, then styles, the root node and the app.
import fs from "node:fs"

const html = fs.readFileSync("dist-single/index.html", "utf8")
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1]
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
const title = head.match(/<title>[\s\S]*?<\/title>/)[0]
const links = head.match(/<link[^>]+fonts\.(googleapis|gstatic)[^>]*>/g) ?? []
const styles = head.match(/<style[\s\S]*?<\/style>/g) ?? []
const scripts = head.match(/<script[\s\S]*?<\/script>/g) ?? []
const out = [title, ...links, ...styles, body.trim().replace(/<script[\s\S]*?<\/script>/g, ""), ...scripts].join("\n")
fs.writeFileSync("dist-single/artifact.html", out)
console.log(`artifact.html ${(out.length / 1024).toFixed(0)} KB · ${scripts.length} script(s) · ${styles.length} style(s)`)
