/**
 * Lambda entry point for the bank-promotions feed.
 *
 * Fetches the Doctor of Credit RSS feed, merges into the cumulative archive
 * stored in S3, and writes it back. Scheduled daily via EventBridge.
 *
 * Required env vars (fail loud — no fallbacks):
 *   DATA_BUCKET  S3 bucket
 *   DATA_KEY     object key, e.g. "promotions.json"
 */

const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} = require("@aws-sdk/client-s3")
const { fetchPromotions, mergePromotions } = require("./promotions")

exports.handler = async () => {
  const bucket = process.env.DATA_BUCKET
  const key = process.env.DATA_KEY
  if (!bucket || !key) {
    throw new Error("DATA_BUCKET and DATA_KEY env vars are required")
  }

  const s3 = new S3Client({})

  let existing = null
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
    existing = JSON.parse(await res.Body.transformToString())
  } catch {
    // first run — no archive yet
  }

  const fresh = await fetchPromotions()
  const merged = mergePromotions(existing, fresh)

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(merged, null, 2),
      ContentType: "application/json",
      CacheControl: "public, max-age=3600",
    })
  )

  console.log(
    `Uploaded s3://${bucket}/${key} (${fresh.length} fresh, ${merged.items.length} archived)`
  )
  return { ok: true, fresh: fresh.length, archived: merged.items.length }
}
