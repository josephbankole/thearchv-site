// The Archive — nine cleared World Cup final posters (chronological).
// Moscow 2018 is intentionally absent (trophy silhouette = design-mark risk).
// All artwork is original ARCHV illustration: no crests, no kit logos, no official marks.
export interface Poster {
  slug: string;
  year: string;
  host: string;
  title: string;
  moment: string;
  stamp: string;
  // Optional Etsy listing (print fulfilled by Printful). Leave undefined until the listing
  // is live; the daily/commerce pipeline populates it and the lightbox "Shop this print"
  // CTA appears automatically. Store: joeydesignca.etsy.com.
  etsyUrl?: string;
}

export const posters: Poster[] = [
  { slug: 'mexico-1970', year: '1970', host: 'Azteca, Mexico City', title: 'The Beautiful Game, In Colour', moment: 'The tournament that brought football to colour television.', stamp: '21.VI.1970', etsyUrl: 'https://www.etsy.com/listing/4521782964' },
  { slug: 'azteca-1986', year: '1986', host: 'Azteca, Mexico City', title: 'Four Minutes In June', moment: "Fifty-one and fifty-five. The worst goal and the greatest, four minutes apart.", stamp: '22.VI.1986', etsyUrl: 'https://www.etsy.com/listing/4521779161' },
  { slug: 'italia-1990', year: '1990', host: 'Rome, Italy', title: 'Notti Magiche', moment: 'The most atmospheric tournament ever staged.', stamp: '08.VII.1990', etsyUrl: 'https://www.etsy.com/listing/4521788550' },
  { slug: 'paris-1998', year: '1998', host: 'Saint-Denis, Paris', title: 'The Night It Turned Blue', moment: 'Three nil. A host nation, champions for the first time.', stamp: '12.VII.1998', etsyUrl: 'https://www.etsy.com/listing/4521790986' },
  { slug: 'yokohama-2002', year: '2002', host: 'Yokohama, Japan', title: 'Redemption', moment: 'Three years of injury, then two goals in a final.', stamp: '30.VI.2002', etsyUrl: 'https://www.etsy.com/listing/4521787127' },
  { slug: 'berlin-2006', year: '2006', host: 'Berlin, Germany', title: 'Decided From Twelve Yards', moment: 'A final settled at the spot, remembered for a moment of madness.', stamp: '09.VII.2006', etsyUrl: 'https://www.etsy.com/listing/4521795838' },
  { slug: 'johannesburg-2010', year: '2010', host: 'Johannesburg, South Africa', title: 'Minute 116', moment: 'The strike that ended forty-four years of waiting.', stamp: '11.VII.2010', etsyUrl: 'https://www.etsy.com/listing/4521798166' },
  { slug: 'maracana-2014', year: '2014', host: 'Maracanã, Rio', title: 'The Volley', moment: 'Chest, volley, history. Extra time in the Maracanã.', stamp: '13.VII.2014', etsyUrl: 'https://www.etsy.com/listing/4521795943' },
  { slug: 'lusail-2022', year: '2022', host: 'Lusail, Qatar', title: 'The Greatest Final', moment: 'Three all, then penalties. The match that ended every argument.', stamp: '18.XII.2022', etsyUrl: 'https://www.etsy.com/listing/4521798833' },
];
