ALTER TABLE posts ADD COLUMN body_gallery TEXT
    CHECK (body_gallery IS NULL OR json_valid(body_gallery));
