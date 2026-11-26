import { serializeJsonLd, type JsonLdObject } from '@/lib/seo/structured-data';

interface JsonLdScriptProps {
  data: JsonLdObject | null;
  id?: string;
}

export function JsonLdScript({ data, id }: JsonLdScriptProps) {
  if (!data) return null;
  return (
    <script
      id={id}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
