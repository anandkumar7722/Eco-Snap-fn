
"use client";

import { useState, useEffect, useMemo, ChangeEvent } from 'react';
import Image, { type StaticImageData } from 'next/image';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from "@/hooks/use-toast";
import { classifyWaste, type ClassifyWasteOutput, type AIWasteCategory as SpecificAIWasteCategory } from '@/ai/flows/classify-waste'; // Updated import
import { saveToLocalStorage, getFromLocalStorage } from '@/lib/storage';
import type { ClassificationRecord, UserProfile, WasteCategory, TipInfo } from '@/lib/types';
import { ImageUpload } from '@/components/image-upload';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
    ImagePlus, ChevronRight, BarChart3, MapPin, BotIcon, LogIn, UserPlus as SignupIcon, Trash2, Leaf,
    Package as PackageIcon, Edit, AlertTriangle, Tv2, Apple, Wind, Lightbulb, Info, Loader2,
    Recycle, HelpCircle, Star as StarIcon, BookOpen, Users, CheckCircle, PackageSearch as PackageSearchIcon, Atom
} from 'lucide-react';
import Link from 'next/link';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from '@/lib/utils';

const HISTORY_STORAGE_KEY = 'ecoSnapHistory';
const USER_DATA_KEY = 'ecoSnapUserData';
const MAX_HISTORY_DISPLAY_ITEMS = 5;

// Points should align with the specific categories the AI will now output
const WASTE_POINTS: Record<WasteCategory, number> = { // Ensured WasteCategory covers all AI outputs
  ewaste: 100,
  plastic: 50, // General, might not be used if AI is specific
  biowaste: 60,
  cardboard: 80,
  paper: 70,
  glass: 30,
  metal: 40,
  organic: 60, // Often synonymous with biowaste
  other: 10, // For "Trash"
  plasticOther: 20,
  plasticPete: 55,
  plasticHdpe: 55,
  plasticPp: 45,
  plasticPs: 15,
  // Broad categories might not be directly output by AI anymore, but points can remain for manual logging or future use
  recyclable: 50, 
  compostable: 60,
  'non-recyclable': 10,
};

const CO2_SAVED_PER_POINT = 0.1;

interface LevelInfo {
  name: string;
  minScore: number;
  targetForNext: number;
  cardColor: string;
  textColor: string;
  badgeIconContainerColor: string;
  badgeImageUrl: string;
  progressBarIndicatorColor: string;
  progressBarTrackColor: string;
}

const LEVELS: LevelInfo[] = [
  { name: 'Bronze', minScore: 0, targetForNext: 500, cardColor: 'bg-purple-600', textColor: 'text-white', badgeIconContainerColor: 'bg-transparent', badgeImageUrl: '/assets/images/bronze-badge.png', progressBarIndicatorColor: 'bg-sky-400', progressBarTrackColor: 'bg-purple-700' },
  { name: 'Silver', minScore: 500, targetForNext: 1500, cardColor: 'bg-purple-600', textColor: 'text-white', badgeIconContainerColor: 'bg-transparent', badgeImageUrl: '/assets/images/silver-badge.png', progressBarIndicatorColor: 'bg-sky-400', progressBarTrackColor: 'bg-purple-700' },
  { name: 'Gold', minScore: 1500, targetForNext: 3000, cardColor: 'bg-purple-600', textColor: 'text-white', badgeIconContainerColor: 'bg-transparent', badgeImageUrl: '/assets/images/gold-badge.png', progressBarIndicatorColor: 'bg-sky-400', progressBarTrackColor: 'bg-purple-700' },
  { name: 'Diamond', minScore: 3000, targetForNext: Infinity, cardColor: 'bg-purple-600', textColor: 'text-white', badgeIconContainerColor: 'bg-transparent', badgeImageUrl: '/assets/images/diamond-badge.png', progressBarIndicatorColor: 'bg-sky-400', progressBarTrackColor: 'bg-purple-700' },
];

const wasteCategoryFiveRTips: Record<WasteCategory | 'general', TipInfo> = {
  general: {
    title: "General Waste Item",
    icon: HelpCircle,
    definition: "Items that don't fit into specific recycling or compost streams, often destined for landfill.",
    fiveRs: { reduce: "Minimize purchases of single-use or non-recyclable items. Opt for products with less packaging.", reuse: "Before discarding, think if the item can be repurposed for another use.", recycle: "Check local guidelines carefully. Some 'other' items might have special drop-off locations.", educate: "Understand what makes items non-recyclable in your area and share this knowledge.", support: "Choose products designed for durability and recyclability. Support businesses with take-back programs for hard-to-recycle items." }
  },
  cardboard: {
    title: "Cardboard", icon: PackageIcon, definition: "Paper-based material, commonly corrugated for boxes or flat for cereal boxes and shoe boxes.",
    fiveRs: { reduce: "Opt for digital subscriptions and statements. Choose products with minimal packaging.", reuse: "Use cardboard boxes for storage, moving, or as a base for art projects and gardening.", recycle: "Flatten ALL boxes. Keep them clean and dry. Remove excessive plastic tape if possible.", educate: "Teach family and friends to flatten boxes to save space in recycling bins and collection trucks.", support: "Buy products made from recycled cardboard. Support companies using sustainable packaging." }
  },
  paper: {
    title: "Paper", icon: BookOpen, definition: "Items like newspapers, magazines, office paper, and mail (not contaminated with food or wax).",
    fiveRs: { reduce: "Go paperless with bills and statements. Print double-sided. Use digital notebooks.", reuse: "Use scrap paper for notes or drafts. Use the back of printed sheets for non-official printing.", recycle: "Keep paper clean and dry. Most paper types are recyclable. Check local guidelines for specifics (e.g., shredded paper).", educate: "Promote paperless options at work or school. Explain the benefits of recycling paper.", support: "Purchase recycled paper products. Support businesses that use sustainable paper sourcing." }
  },
  plastic: { 
    title: "Plastic (General)", icon: Recycle, definition: "A wide range of synthetic or semi-synthetic materials, often found in packaging, bottles, and containers. AI will attempt to identify specific type.",
    fiveRs: { reduce: "Avoid single-use plastics (bags, straws, cutlery, bottles). Choose items with less plastic packaging.", reuse: "Use reusable water bottles, coffee cups, and shopping bags. Repurpose plastic containers for storage.", recycle: "Check local recycling guidelines for accepted plastic types (resin codes #1-#7). Rinse containers. Remove lids if required locally.", educate: "Share information about plastic pollution and local recycling programs. Lead by example.", support: "Choose products made from recycled plastic. Support businesses with plastic reduction initiatives or take-back programs." }
  },
  plasticPete: {
    title: "Plastic - PETE (#1)", icon: Recycle,  definition: "Polyethylene Terephthalate. Common in beverage bottles, food containers. Widely recyclable.",
    fiveRs: { reduce: "Choose reusable bottles. Buy beverages in larger containers or from concentrate.", reuse: "PETE bottles can be refilled (check for safety) or used for DIY projects if clean.", recycle: "Empty and rinse. Most curbside programs accept PETE bottles. Lids on or off depends on local rules.", educate: "Explain that PETE is one of the most commonly recycled plastics. Encourage proper preparation.", support: "Look for products made with recycled PETE (rPET).", }
  },
  plasticHdpe: {
    title: "Plastic - HDPE (#2)", icon: Recycle,  definition: "High-Density Polyethylene. Found in milk jugs, detergent bottles. Often recyclable.",
    fiveRs: { reduce: "Buy concentrated detergents. Opt for bar soap over liquid soap in plastic bottles.", reuse: "HDPE containers are sturdy and can be reused for storage or gardening.", recycle: "Empty and rinse. Commonly accepted in curbside recycling.", educate: "Highlight that HDPE is a valuable recyclable plastic.", support: "Choose products packaged in HDPE when possible if you need plastic.", }
  },
  plasticPp: {
    title: "Plastic - PP (#5)", icon: PackageIcon,  definition: "Polypropylene. Used for yogurt containers, bottle caps, some tubs. Increasingly recyclable.",
    fiveRs: { reduce: "Buy yogurt in larger tubs. Consider making some items (like sauces) at home.", reuse: "PP containers are good for food storage or organizing small items.", recycle: "Check local guidelines; PP acceptance is growing but not universal. Clean items thoroughly.", educate: "Advocate for PP recycling in your community if it's not yet available.", support: "Support brands using easily recyclable PP packaging or offering PP take-back.", }
  },
  plasticPs: {
    title: "Plastic - PS (#6)", icon: AlertTriangle,  definition: "Polystyrene. Found in disposable foam cups/plates, some food containers, packing peanuts. Rarely recycled.",
    fiveRs: { reduce: "AVOID PS whenever possible. Use reusable cups and containers. Ask restaurants for non-PS takeout containers.", reuse: "Packing peanuts can be reused for shipping. Clean PS containers could be used for non-food storage, but prioritize reduction.", recycle: "Very difficult to recycle and rarely accepted. Check for specialized drop-off locations, but they are uncommon.", educate: "Inform others about the environmental issues with PS and the lack of recycling options. Encourage alternatives.", support: "Actively choose businesses that do not use PS packaging. Support bans on single-use polystyrene.", }
  },
  plasticOther: {
    title: "Plastic - Other (#3, #4, #7, or Unmarked)", icon: HelpCircle,  definition: "Miscellaneous plastics, including PVC, LDPE, multi-layer materials, or newer bioplastics. Recyclability varies greatly; often not recyclable curbside.",
    fiveRs: { reduce: "Be cautious with items marked #7 or other less common plastics; try to find alternatives if unsure about recyclability. Avoid products with excessive or mixed-material plastic packaging.", reuse: "Reuse depends heavily on the specific item. Some containers might be durable enough for storage.", recycle: "Generally NOT recyclable in curbside programs unless specifically stated by your local facility. Check local guidelines meticulously.", educate: "Highlight that these plastics are often challenging to recycle. Emphasize looking for known recyclable plastics (#1, #2, sometimes #5).", support: "Support innovation in sustainable packaging. Ask companies about the recyclability of their plastics.", }
  },
  glass: {
    title: "Glass", icon: Lightbulb,  definition: "Made from sand, soda ash, and limestone. Infinitely recyclable without loss of quality.",
    fiveRs: { reduce: "Buy items in glass when it's a good alternative to plastic. Consider products with refill options.", reuse: "Glass jars and bottles are excellent for food storage, preserving, or DIY crafts.", recycle: "Rinse clean. Most curbside programs accept glass bottles and jars. Some areas require color sorting (clear, brown, green).", educate: "Promote glass as a highly recyclable material. Remind others to rinse items.", support: "Choose products packaged in glass. Support local bottle return schemes if available." }
  },
  ewaste: {
    title: "E-Waste", icon: Tv2,  definition: "Electronic waste like old phones, computers, TVs, batteries, cables. Contains valuable and hazardous materials.",
    fiveRs: { reduce: "Repair electronics instead of replacing them. Buy durable, high-quality products. Resist upgrading too frequently.", reuse: "Donate working electronics to charities or schools. Sell or give away usable items.", recycle: "NEVER put e-waste in regular trash or recycling bins. Find designated e-waste collection events or drop-off locations (e.g., some retailers, municipal sites).", educate: "Inform others about the hazards of improper e-waste disposal and the importance of specialized recycling.", support: "Support companies with take-back programs for old electronics or those that design for repairability and recyclability." }
  },
  biowaste: {
    title: "Bio-Waste / Organic", icon: Leaf,  definition: "Organic matter like food scraps (fruit, vegetables, coffee grounds), yard trimmings, and some paper products (if not waxy or coated).",
    fiveRs: { reduce: "Plan meals to reduce food waste. Store food properly to extend its life. Only buy what you need.", reuse: "Use vegetable scraps to make broth. Regrow some vegetables from scraps.", recycle: "Compost at home (backyard bin or worm farm). Use municipal green bin programs if available. Check local rules for what's accepted (e.g., meat, dairy).", educate: "Teach others about composting benefits. Share tips for reducing food waste in the kitchen.", support: "Support community composting initiatives. Choose businesses that compost their organic waste." }
  },
  metal: {
    title: "Metal", icon: Wind,  definition: "Includes aluminum cans, steel/tin cans, and sometimes other metal items. Highly recyclable.",
    fiveRs: { reduce: "Choose reusable containers over single-use cans where possible.", reuse: "Metal cans can be used for storage, planters, or DIY projects.", recycle: "Empty and rinse cans. Most curbside programs accept aluminum and steel cans. Check locally for other metal items (e.g., scrap metal).", educate: "Highlight that metals are valuable and can be recycled repeatedly. Encourage proper preparation.", support: "Buy products in recyclable metal packaging. Support scrap metal recycling facilities." }
  },
  other: { 
    title: "Trash / Other Non-Recyclables", icon: Trash2, definition: "Items that cannot be recycled or composted in your local programs, destined for landfill or incineration.",
    fiveRs: { reduce: "The most important 'R' for trash! Choose products with less packaging, opt for reusables, and repair items instead of discarding.", reuse: "Before trashing, double-check if any part can be repurposed or if there's a specialized, albeit less common, recycling stream (e.g., Terracycle for specific items).", recycle: "Ensure you're not accidentally trashing items that ARE recyclable or compostable in your area. When in doubt, check local guidelines.", educate: "Understand what truly belongs in the trash in your municipality and why. Share this knowledge to reduce contamination in recycling/compost bins.", support: "Support businesses that design products for longevity and with end-of-life in mind. Advocate for better waste management infrastructure and policies." }
  },
  organic: { 
    title: "Organic Waste",  icon: Apple,  definition: "Primarily food scraps and plant matter that can decompose naturally.",
    fiveRs: { reduce: "Smart shopping, proper food storage, and using leftovers creatively can significantly reduce organic waste.", reuse: "Many vegetable scraps can be used to make broth. Coffee grounds can be great for your garden.", recycle: "Compost at home using a bin, pile, or worm farm. Utilize municipal green bin collection services if available.", educate: "Share the benefits of composting and how-to guides. Raise awareness about the impact of food waste.", support: "Support local farms that use compost, community gardens, or businesses with organic waste diversion programs." }
  },
  recyclable: { // This tip set might still be useful if a user directly asks about "recyclable" in general.
    title: "Recyclable Item (General)", icon: Recycle, definition: "Items that can be processed and materials recovered for reuse. Specific material type (e.g., paper, specific plastic) determines actual recyclability in your area.",
    fiveRs: { reduce: "Choose items with less packaging overall. Opt for durable, reusable alternatives to single-use items.", reuse: "Before recycling, see if the item can be repurposed. Jars for storage, paper for scrap, etc.", recycle: "Key: Check local guidelines! Not all 'recyclable' materials are accepted everywhere. Clean and dry items are best. Empty containers. For plastics, know which numbers (#1-7) your facility takes.", educate: "Learn your local recycling rules thoroughly and share them. Explain common contaminants (like food in containers, plastic bags in paper recycling).", support: "Buy products made from recycled materials. Support companies with clear recycling information and sustainable packaging." }
  },
  compostable: { // Similarly for "compostable".
    title: "Compostable Item (General)", icon: Leaf, definition: "Organic matter that can naturally decompose into nutrient-rich compost. Primarily food scraps and yard waste.",
    fiveRs: { reduce: "Minimize food waste by planning meals, storing food correctly, and using leftovers. Avoid over-purchasing perishable goods.", reuse: "Use vegetable scraps to make broth. Regrow certain vegetables (like green onions) from scraps.", recycle: "Compost at home (backyard bin, worm farm) or use municipal green bin/organics collection if available. Check what's accepted (e.g., meat, dairy, certified compostable plastics often have specific rules).", educate: "Promote composting benefits for soil health and waste reduction. Share tips on what can and cannot be composted locally.", support: "Support community composting programs or local farms that use compost. If buying 'compostable' products, verify they are accepted by your local composting facility." }
  },
  'non-recyclable': { // And for "non-recyclable".
    title: "Non-Recyclable Item (General)", icon: Trash2, definition: "Items that currently cannot be recycled or composted through standard municipal programs and are typically sent to landfill.",
    fiveRs: { reduce: "This is the most crucial 'R' here! Avoid items known to be non-recyclable (e.g., Styrofoam, many flexible plastics). Choose products with minimal or recyclable/compostable packaging. Repair items instead of replacing.", reuse: "Before discarding, think if the item (or parts of it) can be repurposed for a completely different use. This might be for crafts, organization, etc.", recycle: "Double-check if there's a special drop-off or mail-in program for the specific item (e.g., some stores take plastic bags, Terracycle for hard-to-recycle waste). However, most items in this category won't have standard recycling options.", educate: "Understand why certain items are non-recyclable (e.g., mixed materials, contamination, lack of market). Share this to help others make informed choices.", support: "Support businesses that design for durability and use easily recyclable/compostable materials. Advocate for policies that reduce non-recyclable waste and improve waste management infrastructure." }
  }
};


const topHorizontalCategories: Array<{
  id: WasteCategory | 'general'; // Updated to include 'general' for AI context
  name: string;
  imageUrl?: string;
  icon?: React.ElementType;
  dataAiHint: string;
}> = [
  { id: 'cardboard', name: 'Cardboard', imageUrl: '/assets/images/cardboard.png', dataAiHint: 'cardboard box' },
  { id: 'paper', name: 'Paper', imageUrl: '/assets/images/paper.png', dataAiHint: 'stack paper' },
  { id: 'plastic', name: 'Plastic', imageUrl: '/assets/images/plastic.png', dataAiHint: 'plastic bottle general', icon: Recycle }, // Added icon for consistency
  { id: 'glass', name: 'Glass', imageUrl: '/assets/images/glass.png', dataAiHint: 'glass jar' },
  { id: 'ewaste', name: 'E-Waste', imageUrl: '/assets/images/ewaste.png', dataAiHint: 'electronic waste' },
  { id: 'biowaste', name: 'Bio-Waste', imageUrl: '/assets/images/bio-waste.png', dataAiHint: 'food waste' },
  { id: 'metal', name: 'Metal', imageUrl: '/assets/images/metal.png', dataAiHint: 'metal items' },
  { id: 'other', name: 'Trash', imageUrl: '/assets/images/trash.png', dataAiHint: 'trash bag' },
];

const verticalLogCategories: Array<{
  id: WasteCategory; // Should map to AI output categories
  name: string;
  imageUrl?: string;
  icon?: React.ElementType;
  points: number;
  dataAiHint: string;
  quantityKey: keyof Pick<UserProfile, 'totalCardboard' | 'totalPaper' | 'totalGlass' | 'totalPlasticPete' | 'totalPlasticHdpe' | 'totalPlasticPp' | 'totalPlasticPs' | 'totalPlasticOther' | 'totalEwaste' | 'totalBiowaste' | 'totalMetal' | 'totalOther' >;
  placeholderText?: string;
}> = [
  { id: 'cardboard', name: 'Cardboard', imageUrl: '/assets/images/cardboard.png', points: WASTE_POINTS.cardboard, dataAiHint: 'cardboard box', quantityKey: 'totalCardboard' },
  { id: 'paper', name: 'Paper', imageUrl: '/assets/images/paper.png', points: WASTE_POINTS.paper, dataAiHint: 'stack paper', quantityKey: 'totalPaper' },
  { id: 'glass', name: 'Glass', imageUrl: '/assets/images/glass.png', points: WASTE_POINTS.glass, dataAiHint: 'glass jar', quantityKey: 'totalGlass' },
  { id: 'plasticPete', name: 'Plastic - PETE', imageUrl: '/assets/images/plastic-pete.png', points: WASTE_POINTS.plasticPete, dataAiHint: 'PETE plastic bottle', quantityKey: 'totalPlasticPete', placeholderText: 'PETE' },
  { id: 'plasticHdpe', name: 'Plastic - HDPE', imageUrl: '/assets/images/plastic-hdpe.png', points: WASTE_POINTS.plasticHdpe, dataAiHint: 'HDPE plastic container', quantityKey: 'totalPlasticHdpe', placeholderText: 'HDPE' },
  { id: 'plasticPp', name: 'Plastic - PP', imageUrl: '/assets/images/plastic-pp.png', points: WASTE_POINTS.plasticPp, dataAiHint: 'PP plastic tub', quantityKey: 'totalPlasticPp', placeholderText: 'PP' },
  { id: 'plasticPs', name: 'Plastic - PS', imageUrl: '/assets/images/plastic-ps.png', points: WASTE_POINTS.plasticPs, dataAiHint: 'PS plastic foam', quantityKey: 'totalPlasticPs', placeholderText: 'PS' },
  { id: 'plasticOther', name: 'Plastic - Other', imageUrl: '/assets/images/plastic-other.png', points: WASTE_POINTS.plasticOther, dataAiHint: 'other plastic items', quantityKey: 'totalPlasticOther', placeholderText: 'OTHER' },
  { id: 'ewaste', name: 'E-Waste', imageUrl: '/assets/images/ewaste.png', points: WASTE_POINTS.ewaste, dataAiHint: 'electronic device', quantityKey: 'totalEwaste' },
  { id: 'biowaste', name: 'Bio-Waste', imageUrl: '/assets/images/bio-waste.png', points: WASTE_POINTS.biowaste, dataAiHint: 'food waste', quantityKey: 'totalBiowaste' },
  { id: 'metal', name: 'Metal', imageUrl: '/assets/images/metal.png', points: WASTE_POINTS.metal, dataAiHint: 'metal can', quantityKey: 'totalMetal'},
  { id: 'other', name: 'Trash', imageUrl: '/assets/images/trash.png', points: WASTE_POINTS.other, dataAiHint: 'general trash', quantityKey: 'totalOther' },
];

const defaultUserProfile: UserProfile = {
  id: 'localUser',
  displayName: 'Guest',
  email: '',
  avatar: `https://placehold.co/100x100.png?text=G`,
  score: 0,
  co2Managed: 0,
  totalEwaste: 0,
  totalPlastic: 0, // This general plastic might become less relevant if AI is always specific
  totalBiowaste: 0,
  totalCardboard: 0,
  totalPaper: 0,
  totalGlass: 0,
  totalMetal: 0,
  totalOrganic: 0, // Keep for now, might be same as biowaste
  totalOther: 0, // For "Trash"
  totalPlasticOther: 0,
  totalPlasticPete: 0,
  totalPlasticHdpe: 0,
  totalPlasticPp: 0,
  totalPlasticPs: 0,
  itemsClassified: 0,
  challengesCompleted: 0,
  badges: [],
};

// Helper component for rendering images with fallback
const ImageWithFallback = ({
  src: initialSrcProp,
  alt,
  dataAiHint,
  placeholderSize = "114x50", 
  sizes = "(max-width: 639px) 94px, 114px", 
  className = "rounded-md object-cover",
  wrapperClassName = "relative w-[94px] h-[44px] sm:w-[114px] sm:h-[50px] rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center",
  icon: IconComponent,
  placeholderText
}: {
  src: string | null | undefined;
  alt: string;
  dataAiHint: string;
  placeholderSize?: string;
  sizes?: string;
  className?: string;
  wrapperClassName?: string;
  icon?: React.ElementType;
  placeholderText?: string;
}) => {
  const validatedInitialSrc = initialSrcProp === "" || initialSrcProp === undefined || initialSrcProp === null ? null : initialSrcProp;
  const [currentSrc, setCurrentSrc] = useState(validatedInitialSrc);
  const [isError, setIsError] = useState(!validatedInitialSrc && !IconComponent && !placeholderText);
  const [isLoading, setIsLoading] = useState(!!validatedInitialSrc);

  useEffect(() => {
    const validatedSrcPropOnUpdate = initialSrcProp === "" || initialSrcProp === undefined || initialSrcProp === null ? null : initialSrcProp;
    if (validatedSrcPropOnUpdate) {
      setCurrentSrc(validatedSrcPropOnUpdate);
      setIsError(false);
      setIsLoading(true);
    } else {
      setCurrentSrc(null);
      setIsError(!IconComponent && !placeholderText); 
      setIsLoading(false);
    }
  }, [initialSrcProp, IconComponent, placeholderText]);

  const handleError = () => {
    if (!isError) setIsError(true); 
    setIsLoading(false);
  };

  const handleLoad = () => {
    setIsLoading(false);
    if (currentSrc === initialSrcProp && initialSrcProp !== null) setIsError(false);
  };

  const placeholderBaseUrl = "https://placehold.co";

  if (IconComponent && (!currentSrc || isError) && !placeholderText) {
    return (
      <div className={wrapperClassName.replace('bg-muted', 'bg-transparent')}>
        <IconComponent className="w-full h-full text-muted-foreground p-1" />
      </div>
    );
  }

  const finalSrc = (!currentSrc || isError)
    ? (placeholderText ? `${placeholderBaseUrl}/${placeholderSize}.png?text=${encodeURIComponent(placeholderText)}` : `${placeholderBaseUrl}/${placeholderSize}.png`)
    : currentSrc;
    
  const isUsingPlaceholder = finalSrc.startsWith(placeholderBaseUrl);

  return (
    <div className={wrapperClassName}>
      {isLoading && !isUsingPlaceholder && <div className="absolute inset-0 flex items-center justify-center bg-muted/50"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
      <Image
        src={finalSrc}
        alt={alt}
        fill
        className={cn(className, (isLoading && !isUsingPlaceholder) ? 'opacity-0' : 'opacity-100')}
        sizes={sizes}
        data-ai-hint={(isError || isUsingPlaceholder) ? `placeholder ${dataAiHint}`.trim() : dataAiHint}
        onError={handleError}
        onLoad={handleLoad}
        unoptimized={isUsingPlaceholder} 
      />
    </div>
  );
};


export default function HomePage() {
  const [userData, setUserData] = useState<UserProfile>(defaultUserProfile);
  const [recentClassifications, setRecentClassifications] = useState<ClassificationRecord[]>([]);
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  // currentUploadCategory stores the category ID (e.g., 'cardboard', 'plasticPete')
  const [currentUploadCategory, setCurrentUploadCategory] = useState<WasteCategory | 'general' | undefined>(undefined);
  // currentUploadCategoryFriendlyName stores the display name (e.g., "Cardboard", "Plastic - PETE")
  const [currentUploadCategoryFriendlyName, setCurrentUploadCategoryFriendlyName] = useState<string | undefined>(undefined);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { toast } = useToast();

  // Debug: Log userData whenever it changes
  useEffect(() => {
    console.log(">>> [DEBUG] userData state changed:", JSON.stringify(userData, null, 2));
  }, [userData]);


  useEffect(() => {
    const checkLoginStatus = () => {
      const loggedIn = localStorage.getItem('isLoggedIn') === 'true';
      setIsLoggedIn(loggedIn);
      console.log(">>> [DEBUG] checkLoginStatus - isLoggedIn:", loggedIn);

      let storedUserData = getFromLocalStorage<UserProfile>(USER_DATA_KEY, defaultUserProfile);
      console.log(">>> [DEBUG] checkLoginStatus - Initial storedUserData from localStorage:", JSON.stringify(storedUserData, null, 2));


      if (loggedIn) {
        const userEmail = localStorage.getItem('userEmail');
        const userName = localStorage.getItem('userName');
        if (storedUserData.id === 'localUser' || (userEmail && storedUserData.email !== userEmail) || (userName && storedUserData.displayName !== userName) ) {
           const displayName = userName || (userEmail ? userEmail.split('@')[0] : 'User');
           console.log(">>> [DEBUG] checkLoginStatus - User logged in, but local data needs sync. Re-initializing profile for:", userEmail || "unknown email");
           storedUserData = {
            ...defaultUserProfile, // Start with defaults to ensure all keys are present
            id: userEmail || 'firebaseUser', // Use a more specific ID if email exists
            displayName: displayName,
            email: userEmail || '',
            avatar: `https://placehold.co/100x100.png?text=${displayName.substring(0,2).toUpperCase()}`,
            // Attempt to preserve existing stats if the user was already known locally
            score: (userEmail && storedUserData.email === userEmail) ? storedUserData.score : 0,
            co2Managed: (userEmail && storedUserData.email === userEmail) ? storedUserData.co2Managed : 0,
            itemsClassified: (userEmail && storedUserData.email === userEmail) ? storedUserData.itemsClassified : 0,
            totalCardboard: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalCardboard : 0,
            totalPaper: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalPaper : 0,
            totalGlass: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalGlass : 0,
            totalPlastic: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalPlastic : 0,
            totalOther: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalOther : 0,
            totalEwaste: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalEwaste : 0,
            totalBiowaste: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalBiowaste : 0,
            totalMetal: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalMetal : 0,
            totalOrganic: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalOrganic : 0,
            totalPlasticOther: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalPlasticOther : 0,
            totalPlasticPete: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalPlasticPete : 0,
            totalPlasticHdpe: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalPlasticHdpe : 0,
            totalPlasticPp: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalPlasticPp : 0,
            totalPlasticPs: (userEmail && storedUserData.email === userEmail) ? storedUserData.totalPlasticPs : 0,
            challengesCompleted: (userEmail && storedUserData.email === userEmail) ? storedUserData.challengesCompleted : 0,
            badges: (userEmail && storedUserData.email === userEmail) ? storedUserData.badges : [],
           };
        }
      } else {
        // User is not logged in, ensure we are using the default guest profile
        if (storedUserData.id !== 'localUser') {
            console.log(">>> [DEBUG] checkLoginStatus - User not logged in, resetting to default guest profile.");
            storedUserData = defaultUserProfile;
        }
      }
      
      console.log(">>> [DEBUG] checkLoginStatus - About to call setUserData with:", JSON.stringify(storedUserData, null, 2));
      setUserData(storedUserData);
      
      // Ensure localStorage reflects the current state, especially if reset to default
      const currentLocalStorageData = getFromLocalStorage<UserProfile>(USER_DATA_KEY, {});
      if (JSON.stringify(currentLocalStorageData) !== JSON.stringify(storedUserData)) {
          console.log(">>> [DEBUG] checkLoginStatus - Saving updated/corrected userData to localStorage:", JSON.stringify(storedUserData, null, 2));
          saveToLocalStorage(USER_DATA_KEY, storedUserData);
      }

      const history = getFromLocalStorage<ClassificationRecord[]>(HISTORY_STORAGE_KEY, []);
      const sortedHistory = history.sort((a,b) => b.timestamp - a.timestamp);

      setRecentClassifications(sortedHistory.slice(0, MAX_HISTORY_DISPLAY_ITEMS));
    };

    checkLoginStatus(); // Initial check
    
    // Listen for storage changes from other tabs/windows (optional but good practice)
    window.addEventListener('storage', (event) => {
        if (event.key === USER_DATA_KEY || event.key === 'isLoggedIn' || event.key === HISTORY_STORAGE_KEY) {
            console.log(">>> [DEBUG] Storage event detected for key:", event.key);
            checkLoginStatus();
        }
    });
    
    // Listen for custom authChange event (if you dispatch this elsewhere, e.g., after login/logout)
    window.addEventListener('authChange', checkLoginStatus);
    
    return () => {
        window.removeEventListener('storage', checkLoginStatus);
        window.removeEventListener('authChange', checkLoginStatus);
    };
  }, []); // Empty dependency array to run once on mount and set up listeners


  const handleClassify = async (imageDataUri: string, categoryUserInitiatedWith?: WasteCategory | 'general'): Promise<ClassifyWasteOutput | null> => {
    console.log(">>> [CLASSIFY LOG] handleClassify called. User initiated with category:", categoryUserInitiatedWith);
    if (!isLoggedIn) {
      toast({
        title: "Login Required",
        description: "Please log in or sign up to classify items and track your progress.",
        variant: "destructive",
        action: (
          <Button variant="outline" size="sm" asChild>
            <Link href="/login">Login</Link>
          </Button>
        )
      });
      return null;
    }

    setIsClassifying(true);
    setClassificationError(null);

    try {
      const aiResult = await classifyWaste({ photoDataUri: imageDataUri });
      console.log(">>> [CLASSIFY LOG] AI classification result:", aiResult);

      if (!aiResult || !aiResult.category) {
        setClassificationError("Could not classify the image. The AI returned no result or an invalid category.");
        toast({
          title: "Classification Failed",
          description: "The AI could not process the image correctly. Please try a different image or manually log.",
          variant: "destructive",
        });
        setIsClassifying(false);
        return null;
      }

      // The AI now returns a specific category (e.g., 'cardboard', 'plasticPete', 'other')
      const aiDeterminedSpecificCategory = aiResult.category as WasteCategory; // Cast as WasteCategory, ensure AIWasteCategory from flow aligns
      const classificationConfidence = aiResult.confidence;
      const pointsEarned = WASTE_POINTS[aiDeterminedSpecificCategory] || WASTE_POINTS.other; // Fallback to 'other' points if category unknown

      const newRecord: ClassificationRecord = {
        id: Date.now().toString(),
        imageDataUri,
        category: aiDeterminedSpecificCategory, // Log the specific category from AI
        confidence: classificationConfidence,
        timestamp: Date.now(),
        points: pointsEarned,
      };

      const currentHistory = getFromLocalStorage<ClassificationRecord[]>(HISTORY_STORAGE_KEY, []);
      const updatedHistory = [newRecord, ...currentHistory].slice(0, 50); 
      saveToLocalStorage(HISTORY_STORAGE_KEY, updatedHistory);
      setRecentClassifications(updatedHistory.slice(0, MAX_HISTORY_DISPLAY_ITEMS));

      setUserData(prevData => {
        console.log(">>> [CLASSIFY LOG] setUserData callback. prevData:", JSON.stringify(prevData, null, 2));
        console.log(">>> [CLASSIFY LOG] AI determined specific category for quantity update:", aiDeterminedSpecificCategory);

        const newUserDataState: UserProfile = {
          ...prevData,
          score: prevData.score + pointsEarned,
          co2Managed: parseFloat((prevData.co2Managed + (pointsEarned * CO2_SAVED_PER_POINT)).toFixed(1)),
          itemsClassified: prevData.itemsClassified + 1,
        };
        
        // Find the corresponding entry in verticalLogCategories to get the quantityKey
        const categoryDetails = verticalLogCategories.find(cat => cat.id === aiDeterminedSpecificCategory);
        
        if (categoryDetails && categoryDetails.quantityKey) {
          const keyToUpdate = categoryDetails.quantityKey;
          const currentSpecificQuantity = Number(newUserDataState[keyToUpdate] || 0); // Use newUserDataState to avoid stale closure over prevData
          console.log(`>>> [CLASSIFY LOG] Found quantityKey for AI category '${aiDeterminedSpecificCategory}': ${keyToUpdate}`);
          console.log(`>>> [CLASSIFY LOG] Current value for ${keyToUpdate} in newUserDataState (before increment): ${currentSpecificQuantity}`);
          
          newUserDataState[keyToUpdate] = currentSpecificQuantity + 1;
          console.log(`>>> [CLASSIFY LOG] Updated specific quantity for ${keyToUpdate} in newUserDataState to: ${newUserDataState[keyToUpdate]}`);
        } else {
           console.warn(`>>> [CLASSIFY WARN] Could not find category details or quantityKey for AI-determined category: ${aiDeterminedSpecificCategory}. No specific quantity updated.`);
        }

        saveToLocalStorage(USER_DATA_KEY, newUserDataState);
        console.log(">>> [CLASSIFY LOG] FINAL newUserDataState for setUserData:", JSON.stringify(newUserDataState, null, 2));
        return newUserDataState;
      });

      toast({
        title: "Classification Successful!",
        description: `Item classified as ${aiDeterminedSpecificCategory.charAt(0).toUpperCase() + aiDeterminedSpecificCategory.slice(1)}. You earned ${pointsEarned} points!`,
      });
      setIsUploadModalOpen(false); 
      return { category: aiDeterminedSpecificCategory, confidence: classificationConfidence };

    } catch (error) {
      console.error(">>> [CLASSIFY ERROR] Error during classification process:", error);
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred during classification.";
      setClassificationError(errorMessage);
      toast({
        title: "Classification Error",
        description: errorMessage,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsClassifying(false);
      // setCurrentUploadCategory(undefined); // Keep this if dialog needs to remember, or clear if it should reset
      // setCurrentUploadCategoryFriendlyName(undefined);
      console.log(">>> [CLASSIFY LOG] Process finished.");
    }
  };

  const getCurrentLevel = (score: number): LevelInfo => {
    for (let i = LEVELS.length - 1; i >= 0; i--) {
      if (score >= LEVELS[i].minScore) {
        return LEVELS[i];
      }
    }
    return LEVELS[0];
  };

  const openUploadModalForCategory = (categoryId: WasteCategory | 'general' | undefined, categoryName: string) => {
    setClassificationError(null); 
    setCurrentUploadCategory(categoryId); // Set the specific category ID
    setCurrentUploadCategoryFriendlyName(categoryName);
    setIsUploadModalOpen(true);
    console.log(">>> [MODAL_OPEN] Dialog opened for category:", categoryId, "Name:", categoryName);
  };

  const currentLevel = useMemo(() => getCurrentLevel(userData.score), [userData.score]);

  let scorePercentage = 0;
  let pointsForNextLevelDisplay: string | number = currentLevel.targetForNext;

  if (currentLevel.targetForNext !== Infinity) {
    const pointsEarnedInLevel = Math.max(0, userData.score - currentLevel.minScore);
    const pointsToNextLevelRange = currentLevel.targetForNext - currentLevel.minScore;
    if (pointsToNextLevelRange > 0) {
      scorePercentage = Math.min((pointsEarnedInLevel / pointsToNextLevelRange) * 100, 100);
    } else {
      scorePercentage = userData.score >= currentLevel.minScore ? 100 : 0;
    }
  } else {
    scorePercentage = 100; 
    pointsForNextLevelDisplay = "Max";
  }

  // This useMemo hook determines which set of tips to show in the dialog.
  // It uses currentUploadCategory, which is set when a user clicks a category item.
  const selectedCategoryTips = useMemo(() => {
      console.log(">>> [DEBUG] selectedCategoryTips useMemo. currentUploadCategory:", currentUploadCategory);
      const tipKey = currentUploadCategory && currentUploadCategory !== 'general' && wasteCategoryFiveRTips[currentUploadCategory] 
                     ? currentUploadCategory 
                     : 'general';
      return wasteCategoryFiveRTips[tipKey];
  }, [currentUploadCategory]);
  
  const SelectedCategoryIcon = useMemo(() => selectedCategoryTips?.icon || HelpCircle, [selectedCategoryTips]);

  const fiveRTipsArray = useMemo(() => {
    if (!selectedCategoryTips || !selectedCategoryTips.fiveRs) return [];
    return (Object.keys(selectedCategoryTips.fiveRs) as Array<keyof TipInfo['fiveRs']>)
      .map(key => ({ key, tip: selectedCategoryTips.fiveRs[key] }))
      .filter(item => item.tip); 
  }, [selectedCategoryTips]);
  
  console.log(">>> [RENDER] HomePage rendering with userData for list:", JSON.stringify(userData, null, 2));

  return (
    <div className="flex flex-col gap-4 sm:gap-6 pb-24">
      <section className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-2">
        <div>
          <p className="text-muted-foreground text-sm sm:text-base">Hi {userData.displayName || 'Guest'}!</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Let&apos;s recycle</h1>
        </div>
      </section>

      {!isLoggedIn && (
        <Card className="bg-primary/10 p-4 sm:p-6 text-center">
            <CardTitle className="text-primary mb-2 text-lg sm:text-xl">Join the EcoSnap Community!</CardTitle>
            <CardDescription className="mb-4 text-sm sm:text-base">
              Log in or sign up to classify waste, track your progress, and earn rewards.
            </CardDescription>
            <div className="flex gap-2 sm:gap-3 justify-center">
              <Button asChild>
                <Link href="/login"><LogIn className="mr-2 h-4 w-4"/>Login</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/signup"><SignupIcon className="mr-2 h-4 w-4"/>Sign Up</Link>
              </Button>
            </div>
        </Card>
      )}

      <section className="mt-1 mb-4">
        <h2 className="text-base sm:text-xl font-semibold mb-2 text-foreground">Quick Classify</h2>
        <div className="flex overflow-x-auto space-x-3 pb-3 no-scrollbar">
          {topHorizontalCategories.map(category => {
            const CategoryIconComponent = category.icon;
            return (
              // Dialog for top horizontal categories
              <Dialog key={`top-${category.id}`} open={isUploadModalOpen && currentUploadCategory === category.id && currentUploadCategoryFriendlyName === category.name} onOpenChange={ open => {
                if(open) { openUploadModalForCategory(category.id, category.name); }
                else {
                  // Only reset if this specific dialog is being closed and not during classification
                  if(currentUploadCategory === category.id && currentUploadCategoryFriendlyName === category.name && !isClassifying) {
                    setCurrentUploadCategory(undefined);
                    setCurrentUploadCategoryFriendlyName(undefined);
                  }
                  if (!open) setIsUploadModalOpen(false); // General close for any dialog
                }
              }}>
                <DialogTrigger asChild>
                  <Card
                    onClick={() => openUploadModalForCategory(category.id, category.name)}
                    className="p-3 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors shadow-sm w-[90px] sm:w-[100px] flex-shrink-0"
                  >
                     <ImageWithFallback
                        src={category.imageUrl}
                        alt={category.name}
                        dataAiHint={category.dataAiHint}
                        placeholderSize="48x48"
                        sizes="48px"
                        wrapperClassName="relative w-10 h-10 sm:w-12 sm:h-12 rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center"
                        className="rounded-md object-contain"
                        icon={CategoryIconComponent ? CategoryIconComponent : undefined} 
                      />
                    <p className="font-medium text-xs sm:text-sm text-center truncate w-full">{category.name}</p>
                  </Card>
                </DialogTrigger>
              </Dialog>
            );
          })}
        </div>
      </section>


      <section className="space-y-2 sm:space-y-3">
        <h2 className="text-base sm:text-xl font-semibold mb-2 text-foreground">Log Items by Category</h2>
        {verticalLogCategories.map(item => {
          // Ensure userData is valid and item.quantityKey is a valid key of userData
          const quantity = (userData && typeof userData[item.quantityKey] === 'number') ? userData[item.quantityKey] as number : 0;
          const ItemIconComponent = item.icon;
          return (
            // Dialog for vertical log categories
            <Dialog key={item.id} open={isUploadModalOpen && currentUploadCategory === item.id && currentUploadCategoryFriendlyName === item.name} onOpenChange={ open => {
              if(open) { openUploadModalForCategory(item.id, item.name); }
              else {
                 // Only reset if this specific dialog is being closed and not during classification
                 if(currentUploadCategory === item.id && currentUploadCategoryFriendlyName === item.name && !isClassifying) {
                    setCurrentUploadCategory(undefined);
                    setCurrentUploadCategoryFriendlyName(undefined);
                 }
                  if (!open) setIsUploadModalOpen(false); // General close for any dialog
              }
            }}>
              <DialogTrigger asChild>
                <Card
                  onClick={() => openUploadModalForCategory(item.id, item.name)}
                  className="p-3 sm:p-4 flex items-center gap-3 sm:gap-4 cursor-pointer hover:bg-muted/50 transition-colors shadow-sm"
                >
                  <ImageWithFallback
                    src={item.imageUrl}
                    alt={item.name}
                    dataAiHint={item.dataAiHint}
                    placeholderSize="114x50"
                    sizes="(max-width: 639px) 94px, 114px"
                    icon={ItemIconComponent ? ItemIconComponent : undefined} 
                    wrapperClassName="relative w-[94px] h-[44px] sm:w-[114px] sm:h-[50px] rounded-md overflow-hidden bg-muted flex-shrink-0 flex items-center justify-center"
                    className="rounded-md object-contain"
                    placeholderText={item.placeholderText}
                  />
                  <div className="flex-grow">
                    <p className="font-medium text-sm sm:text-base">{item.name}</p>
                    <p className="text-xs sm:text-sm text-muted-foreground">{item.points} pts</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base sm:text-lg font-semibold text-primary">{quantity}</p>
                    <p className="text-xs text-muted-foreground">Quantity</p>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground ml-1 sm:ml-2 flex-shrink-0" />
                </Card>
              </DialogTrigger>
            </Dialog>
          );
        })}
      </section>

      {isLoggedIn && (
        <section>
          <h2 className="text-base sm:text-xl font-semibold mb-2 text-foreground">Progress - {currentLevel.name} Level</h2>
          <Card className={cn("p-3 sm:p-6 shadow-xl", currentLevel.cardColor, currentLevel.textColor)}>
            <div className="flex justify-between items-start">
              <div>
                <p className={cn("text-xs sm:text-sm opacity-90", currentLevel.textColor === 'text-white' ? 'text-purple-50' : '')}>Waste managed: {userData.co2Managed.toFixed(1)} Kg CO₂</p>
                <p className="text-lg sm:text-2xl font-bold mt-1">
                  {userData.score} / {pointsForNextLevelDisplay} points
                </p>
              </div>
              <div className={cn("p-1.5 sm:p-2 rounded-full", currentLevel.badgeIconContainerColor)}>
                <Image
                  src={currentLevel.badgeImageUrl}
                  alt={`level ${currentLevel.name.toLowerCase()} badge`}
                  width={95}
                  height={95}
                  className="h-14 w-14 sm:h-20 sm:w-20"
                  data-ai-hint={`level ${currentLevel.name.toLowerCase()} badge`}
                />
              </div>
            </div>
            <div className={cn("mt-2 sm:mt-4 w-[80%] mx-auto")}> 
                 <Progress
                    value={scorePercentage}
                    className={cn(
                        currentLevel.progressBarTrackColor,
                        `[&>div]:${currentLevel.progressBarIndicatorColor}`,
                        "h-3 sm:h-4" 
                    )}
                    aria-label={`${currentLevel.name} level progress ${scorePercentage.toFixed(0)}%`}
                />
            </div>
          </Card>
        </section>
      )}

      {isLoggedIn && recentClassifications.length > 0 && (
        <section>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-base sm:text-xl font-semibold text-foreground">Recent Items</h2>
             <Button variant="link" asChild className="text-primary p-0 h-auto text-xs sm:text-base">
                <Link href="/history">View all <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 ml-1" /></Link>
            </Button>
          </div>
            <div className="flex overflow-x-auto space-x-3 pb-3 no-scrollbar">
              {recentClassifications.map(item => {
                const categoryDetails = verticalLogCategories.find(cat => cat.id === item.category);
                // The quantity displayed here should be for the specific category AI identified.
                const quantity = categoryDetails && userData && typeof userData[categoryDetails.quantityKey] === 'number'
                   ? userData[categoryDetails.quantityKey] as number
                   : 0; // Fallback if no specific quantity or details found

                return (
                  <Card key={item.id} className="p-3 flex items-center gap-3 min-w-[280px] sm:min-w-[320px] flex-shrink-0 shadow-sm hover:shadow-md transition-shadow">
                    <ImageWithFallback
                        src={item.imageDataUri}
                        alt={item.category}
                        dataAiHint={`${item.category} item`}
                        placeholderSize="64x64"
                        sizes="(max-width: 639px) 48px, 64px" // Adjusted sizes
                        wrapperClassName="relative w-12 h-12 sm:w-16 sm:h-16 rounded-md overflow-hidden bg-muted flex-shrink-0"
                        className="rounded-md object-cover"
                    />
                    <div className="flex-grow overflow-hidden">
                      <p className="font-medium capitalize text-sm sm:text-base truncate">{item.category.charAt(0).toUpperCase() + item.category.slice(1)}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        {item.points || 0} pts
                      </p>
                    </div>
                     <div className="text-right flex-shrink-0 ml-2">
                        <p className="text-sm sm:text-base font-semibold text-primary">x {quantity}</p>
                     </div>
                  </Card>
                );
              })}
            </div>
        </section>
      )}
       {isLoggedIn && recentClassifications.length === 0 && (
         <section>
            <div className="flex justify-between items-center mb-2">
                <h2 className="text-base sm:text-xl font-semibold text-foreground">Recent Items</h2>
            </div>
            <Card className="p-3 sm:p-4 text-center text-muted-foreground text-sm">
              <p>No items classified yet. Tap a category above or the <ImagePlus className="inline h-4 w-4 relative -top-px" /> button to start!</p>
            </Card>
         </section>
      )}

      <Separator className="my-2 sm:my-4" />

      <section className="space-y-2 sm:space-y-3">
        <h2 className="text-base sm:text-xl font-semibold text-foreground">Explore More</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            <Link href="/dashboard" className="block">
              <Card className="p-3 sm:p-4 hover:bg-muted/50 transition-colors h-full">
                <div className="flex items-center gap-2 sm:gap-3">
                  <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-sm sm:text-base">Waste Dashboard</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">Visualize your impact.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
              </Card>
            </Link>
            <Link href="/challenges" className="block">
              <Card className="p-3 sm:p-4 hover:bg-muted/50 transition-colors h-full">
                <div className="flex items-center gap-2 sm:gap-3">
                  <StarIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-sm sm:text-base">Eco Challenges</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">Earn points and badges.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
              </Card>
            </Link>
             <Link href="/recycling-centers" className="block">
              <Card className="p-3 sm:p-4 hover:bg-muted/50 transition-colors h-full">
                <div className="flex items-center gap-2 sm:gap-3">
                  <MapPin className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-sm sm:text-base">Recycling Hub</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">Find centers & schedules.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
              </Card>
            </Link>
             <Link href="/assistant" className="block">
              <Card className="p-3 sm:p-4 hover:bg-muted/50 transition-colors h-full">
                <div className="flex items-center gap-2 sm:gap-3">
                  <BotIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
                  <div>
                    <h3 className="font-medium text-sm sm:text-base">AI Assistant</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">Get eco advice.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5 ml-auto text-muted-foreground flex-shrink-0" />
                </div>
              </Card>
            </Link>
        </div>
      </section>

      {/* Shared Dialog for all classification triggers */}
      <Dialog open={isUploadModalOpen} onOpenChange={open => {
          if(!open) {
            setClassificationError(null); 
            // Reset currentUploadCategory only if the dialog is closed by user interaction
            // AND not while a classification is in progress.
            if (!isClassifying) { 
                setCurrentUploadCategory(undefined);
                setCurrentUploadCategoryFriendlyName(undefined);
                console.log(">>> [MODAL_CLOSE] Dialog closed, not classifying. Reset currentUploadCategory.");
            }
          }
          setIsUploadModalOpen(open);
      }}>
        {/* This DialogTrigger is only here to ensure Dialog can exist without an explicit trigger in the main flow,
            as other elements (cards) act as triggers. It's not meant to be visible or primary. */}
        <DialogTrigger asChild>
           <Button
             onClick={() => openUploadModalForCategory('general', 'General Waste Item')}
             className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-14 w-14 rounded-full shadow-2xl p-0 z-50"
             aria-label="Upload image for general classification"
           >
            <ImagePlus className="h-7 w-7" />
          </Button>
        </DialogTrigger>
        <DialogContent className="p-4 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-md sm:text-lg">
              <SelectedCategoryIcon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
              {currentUploadCategoryFriendlyName || "Classify Waste Item"}
            </DialogTitle>
          </DialogHeader>

          {selectedCategoryTips && selectedCategoryTips.definition && (
            <p className="text-sm text-muted-foreground my-2 italic">{selectedCategoryTips.definition}</p>
          )}

          {fiveRTipsArray.length > 0 && (
            <div className="my-1 sm:my-2 space-y-1.5 text-sm max-h-[120px] sm:max-h-[150px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
              <h3 className="font-semibold text-sm text-primary mb-1">5 Rs of Waste Management:</h3>
              {fiveRTipsArray.map((tipItem) => (
                <div key={tipItem.key}>
                  <p className="font-medium capitalize text-primary/90">{tipItem.key}:</p>
                  <p className="text-muted-foreground text-xs sm:text-sm leading-relaxed">{tipItem.tip}</p>
                </div>
              ))}
            </div>
          )}

            {currentUploadCategory && ['plasticPete', 'plasticHdpe', 'plasticPp', 'plasticPs', 'plasticOther'].includes(currentUploadCategory as string) && (
                <Alert variant="default" className="my-2">
                    <Lightbulb className="h-4 w-4" />
                    <AlertTitle>Plastic Tip</AlertTitle>
                    <AlertDescription>
                        Always check your local recycling guidelines for specific plastic types. Clean and empty plastics are more likely to be recycled!
                    </AlertDescription>
                </Alert>
            )}

          <Separator className={cn(
            ( (selectedCategoryTips && selectedCategoryTips.definition) || fiveRTipsArray.length > 0 ||
              (currentUploadCategory && ['plasticPete', 'plasticHdpe', 'plasticPp', 'plasticPs', 'plasticOther'].includes(currentUploadCategory as string))
            ) ? "my-2" : "my-0"
          )} />

          <ImageUpload
            onClassify={(imageDataUri) => handleClassify(imageDataUri, currentUploadCategory)} // Pass currentUploadCategory here
            isClassifying={isClassifying}
            classificationError={classificationError}
            initialPromptText={currentUploadCategoryFriendlyName && currentUploadCategoryFriendlyName !== 'General Waste Item' ? `Image of ${currentUploadCategoryFriendlyName.toLowerCase()}` : undefined}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
