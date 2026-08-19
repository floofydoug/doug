/**
 * Lambda entry point for the EDGAR scanner.
 *
 * Runs the detectors and uploads scanner.json to S3, where the /finances page
 * on dougphung.com fetches it. Scheduled via EventBridge (see scanner/README.md).
 *
 * Required env vars (fail loud — no fallbacks):
 *   DATA_BUCKET  S3 bucket to write to
 *   DATA_KEY     object key, e.g. "scanner.json"
 */

const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3")
const { runScan } = require("./scan")

exports.handler = async () => {
  const bucket = process.env.DATA_BUCKET
  const key = process.env.DATA_KEY
  if (!bucket || !key) {
    throw new Error("DATA_BUCKET and DATA_KEY env vars are required")
  }

  const output = await runScan()
  const body = JSON.stringify(output, null, 2)

  const s3 = new S3Client({})
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
      CacheControl: "public, max-age=300",
    })
  )

  const totals = output.detectors.map(d => `${d.id}=${d.hits.length}`).join(" ")
  console.log(`Uploaded s3://${bucket}/${key} (${totals})`)
  return { ok: true, totals }
}
