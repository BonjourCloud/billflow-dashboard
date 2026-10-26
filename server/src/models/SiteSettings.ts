
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
      default: "BillFlow",
      maxlength: 40,
    },
    logo_url: { type: String, default: null },
    hero_headline: {
      type: String,
      required: true,
      default: "Take Control of Your Financial Life",
      maxlength: 120,
    },
    hero_subheadline: {
      type: String,
      required: true,
      default:
        "Track bills, manage subscriptions, and unlock AI-driven spending insights — all in one beautiful, intuitive dashboard.",
      maxlength: 400,
    },
    hero_cta_label: {
      type: String,
      required: true,
      default: "Start Free — No Card Needed",
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
