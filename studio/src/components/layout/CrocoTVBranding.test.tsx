import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CrocoTVBranding, { CROCOTV_CANVAS_URL } from "./CrocoTVBranding";

describe("CrocoTVBranding", () => {
  it("uses the canonical Canvas brand asset and home destination", () => {
    render(<CrocoTVBranding />);

    const brandLink = screen.getByRole("link", { name: "CrocoTV" });
    expect(brandLink).toHaveAttribute("href", CROCOTV_CANVAS_URL);
    expect(brandLink.querySelector("img")).toHaveAttribute("src", "/crocotv-icon.png");
    expect(screen.getByText("CrocoTV")).toBeInTheDocument();
  });
});
