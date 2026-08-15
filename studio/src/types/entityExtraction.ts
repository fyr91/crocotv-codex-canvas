export interface ExtractionEntity {
    id?: string;
    name: string;
    description?: string;
    [key: string]: unknown;
}

export interface ExtractionPreview {
    characters: ExtractionEntity[];
    scenes: ExtractionEntity[];
    props: ExtractionEntity[];
}
