'use client'

import { useState } from 'react'
import Image from 'next/image'

// FR-06, NFR-06: Use initials when the Google photo is missing or fails.
export function Avatar({ name, image }: { readonly name: string | null; readonly image: string | null }) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  if (image && image !== failedImage) {
    return <Image className="avatar" src={image} alt="Your profile photo" width={56} height={56}
      unoptimized referrerPolicy="no-referrer" onError={() => setFailedImage(image)} />
  }
  return <span className="avatar" aria-hidden="true">{(Array.from(name?.trim() || 'M')[0] ?? 'M').toUpperCase()}</span>
}
