
# Documents module (GECOM)

This folder contains a NestJS module for `documents` CRUD (metadata only).

## Where to place
- Copy `documents/` into: `src/modules/documents/`
- Add `DocumentsModule` import into your main `AppModule` (or the module aggregator you use).

## Prisma schema (required)
Add the `documents` model and the back-relations to `companies` and `users`.

Suggested Prisma model:

```prisma
model documents {
  id                String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid

  company_id         String  @db.Uuid
  created_by_user_id String? @db.Uuid

  name               String   @db.VarChar(255)
  description        String?

  mime_type          String?  @db.VarChar(120)
  size_bytes         BigInt   @default(0)

  external_key       String?

  is_folder          Boolean  @default(false)
  readonly           Boolean  @default(false)

  parent_id          String?  @db.Uuid
  parent_path        String?
  folder_name        String?  @db.VarChar(255)

  related_table      String?  @db.VarChar(50)
  related_id         String?  @db.Uuid

  // Cloudflare R2 controls (for later integration)
  r2_bucket          String?  @db.VarChar(120)
  r2_key             String?
  r2_etag            String?  @db.VarChar(128)
  r2_version_id      String?  @db.VarChar(128)
  checksum_sha256    String?  @db.VarChar(64)
  uploaded_at        DateTime? @db.Timestamptz(6)

  created_at         DateTime @default(now()) @db.Timestamptz(6)
  updated_at         DateTime @default(now()) @db.Timestamptz(6)
  deleted_at         DateTime? @db.Timestamptz(6)

  // Relations
  company            companies @relation("CompanyDocuments", fields: [company_id], references: [id], onDelete: Cascade)
  createdBy          users?    @relation("UserDocumentsCreated", fields: [created_by_user_id], references: [id], onDelete: SetNull)

  parent             documents? @relation("DocumentChildren", fields: [parent_id], references: [id], onDelete: SetNull)
  children           documents[] @relation("DocumentChildren")

  @@index([company_id], map: "IDX_DOCUMENTS_COMPANY_ID")
  @@index([parent_id], map: "IDX_DOCUMENTS_PARENT_ID")
  @@index([related_table, related_id], map: "IDX_DOCUMENTS_RELATED")
  @@index([is_folder], map: "IDX_DOCUMENTS_IS_FOLDER")
  @@index([created_by_user_id], map: "IDX_DOCUMENTS_CREATED_BY")
}

// add back-relations
model companies {
  // ...
  documents documents[] @relation("CompanyDocuments")
}

model users {
  // ...
  documents_created documents[] @relation("UserDocumentsCreated")
}
```

## Notes
- This module does NOT do file upload yet. It only manages metadata.
- For "Drive-like" hierarchy, we use `parent_id` (adjacency list). `parent_path` is optional and can be materialized by your app for faster navigation.
