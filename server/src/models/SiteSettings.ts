
import mongoose from "mongoose";

const siteSettingsSchema = new mongoose.Schema(
  {
    settingsId: {
      type: String,
      required: true,
      unique: true,
      default: "default",
      trim: true,
    },
    brand_name: {
      type: String,
      required: true,
      default: "BillWill",
      maxlength: 40,
    },
    logo_url: { type: String, default: null },
    hero_headline: {
      type: String,
      required: true,
      default: "Where there’s a Bill, there’s a Will.",
      maxlength: 120,
    },
    hero_subheadline: {
      type: String,
      required: true,
      default:
        "Track every bill, subscription and EMI in one calm dashboard — so you always know what’s due, what’s paid, and what’s next.",
      maxlength: 400,
    },
    hero_cta_label: {
      type: String,
      required: true,
      default: "Get Early Access",
      maxlength: 40,
    },
    theme_primary_hsl: {
      type: String,
      required: true,
      default: "142 71% 45%",
    },
    theme_accent_hsl: {
      type: String,
      required: true,
      default: "217 91% 60%",
    },
    theme_background_hsl: {
      type: String,
      required: true,
      default: "222 47% 4%",
    },
    theme_font_pair: {
      type: String,
      required: true,
      default: "inter",
    },
  },
  { timestamps: true, versionKey: false },
);

export const SiteSettings =
  mongoose.models.SiteSettings ||
  mongoose.model("SiteSettings", siteSettingsSchema);
