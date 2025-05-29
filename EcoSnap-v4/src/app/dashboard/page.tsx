
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    BarChart as BarChartIconGeneral, PieChart as PieChartIconLucideGeneral, Info, Edit, Filter, CalendarDays as CalendarIcon,
    Loader2, LineChart as LineChartIcon, PieChart as PieChartIconLucideEWaste, BarChart as BarChartIconEWaste,
    Clock, Server, Smartphone, Laptop, Battery as BatteryIcon, Package as EWastePackageIcon, WifiOff, AlertCircleIcon, CheckCircle2Icon, TrashIcon,
    BatteryWarning, Box, CircleGauge, BatteryFull, PackageCheck, PackageX, Trash2
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import {
  Bar,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart as RechartsBarChart,
  PieChart as RechartsPieChart,
  LineChart as RechartsLineChart,
  Line as RechartsLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
  Cell
} from "recharts";
import { useEffect, useState, useMemo } from 'react';
import type { WasteEntry, WasteCategory, RealTimeEWasteDataPoint, EWasteCategoryDistributionPoint, MonthlyEWasteDataPoint, EWasteCategory as EWasteType, BinData, Bin1FillLevelHistoryPoint } from '@/lib/types';
import type { DateRange } from "react-day-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, format, subMonths, addSeconds, differenceInHours } from "date-fns";
import { firestore, database } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, Timestamp } from 'firebase/firestore';
import { ref, onValue, off } from 'firebase/database';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';


const allWasteCategories: WasteCategory[] = ['ewaste', 'plastic', 'biowaste', 'cardboard', 'paper', 'glass', 'metal', 'organic', 'other', 'plasticPete', 'plasticHdpe', 'plasticPp', 'plasticPs', 'plasticOther', 'recyclable', 'compostable', 'non-recyclable'];

const generalChartConfig = {
  items: { label: "Items/Kg" },
  ewaste: { label: "E-Waste", color: "hsl(var(--chart-1))" },
  plastic: { label: "Plastic", color: "hsl(var(--chart-2))" },
  biowaste: { label: "Bio-Waste", color: "hsl(var(--chart-3))" },
  organic: { label: "Organic", color: "hsl(var(--chart-3))" },
  cardboard: { label: "Cardboard", color: "hsl(var(--chart-4))" },
  paper: { label: "Paper", color: "hsl(var(--chart-5))" },
  glass: { label: "Glass", color: "hsl(var(--chart-1))" },
  metal: { label: "Metal", color: "hsl(var(--chart-2))" },
  other: { label: "Other", color: "hsl(var(--muted))" },
  plasticPete: { label: "Plastic PETE", color: "hsl(var(--chart-2))" },
  plasticHdpe: { label: "Plastic HDPE", color: "hsl(var(--chart-2))" },
  plasticPp: { label: "Plastic PP", color: "hsl(var(--chart-2))" },
  plasticPs: { label: "Plastic PS", color: "hsl(var(--chart-2))" },
  plasticOther: { label: "Plastic Other", color: "hsl(var(--chart-2))" },
  recyclable: { label: "Recyclable", color: "hsl(var(--chart-1))" },
  compostable: { label: "Compostable", color: "hsl(var(--chart-3))" },
  'non-recyclable': { label: "Non-Recyclable", color: "hsl(var(--chart-5))" },
} satisfies import("@/components/ui/chart").ChartConfig;

const MAX_REAL_TIME_EWASTE_POINTS = 20;
const REAL_TIME_EWASTE_UPDATE_INTERVAL = 3000;

const eWasteCategoryColors: Record<EWasteType | 'others', string> = {
  batteries: 'hsl(var(--chart-1))',
  mobiles: 'hsl(var(--chart-3))',
  laptops: 'hsl(var(--accent))',
  others: 'hsl(var(--chart-5))',
};

const eWasteCategoryConfig = {
  batteries: { label: "Batteries", color: eWasteCategoryColors.batteries, icon: BatteryIcon },
  mobiles: { label: "Mobiles", color: eWasteCategoryColors.mobiles, icon: Smartphone },
  laptops: { label: "Laptops", color: eWasteCategoryColors.laptops, icon: Laptop },
  others: { label: "Other E-Waste", color: eWasteCategoryColors.others, icon: EWastePackageIcon },
} satisfies Record<EWasteType | 'others', {label: string; color: string; icon: React.ElementType}>;


export default function DetailedDashboardPage() {
  const [isMobileView, setIsMobileView] = useState(false);
  const [liveWasteData, setLiveWasteData] = useState<WasteEntry[]>([]);
  const [filteredData, setFilteredData] = useState<WasteEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [firestoreDataError, setFirestoreDataError] = useState<string | null>(null);
  const { toast } = useToast();

  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedWasteType, setSelectedWasteType] = useState<WasteCategory | 'all'>('all');

  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [realTimeEWasteData, setRealTimeEWasteData] = useState<RealTimeEWasteDataPoint[]>([]);
  const [eWasteDistributionData, setEWasteDistributionData] = useState<EWasteCategoryDistributionPoint[]>([]);
  const [monthlyEWasteVolume, setMonthlyEWasteVolume] = useState<MonthlyEWasteDataPoint[]>([]);

  const [smartBinsData, setSmartBinsData] = useState<BinData[]>([]);
  const [isLoadingSmartBins, setIsLoadingSmartBins] = useState(true);
  const [smartBinsError, setSmartBinsError] = useState<string | null>(null);

  const [bin1HistoryData, setBin1HistoryData] = useState<Bin1FillLevelHistoryPoint[]>([]);
  const [isLoadingBin1History, setIsLoadingBin1History] = useState(true);
  const [bin1HistoryError, setBin1HistoryError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const checkMobile = () => setIsMobileView(window.innerWidth < 768);
        checkMobile();
        window.addEventListener('resize', checkMobile);
        
        setDateRange({
            from: addDays(new Date(), -90),
            to: new Date(),
        });
        
        setCurrentTime(new Date());
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        
        return () => {
            window.removeEventListener('resize', checkMobile);
            clearInterval(timer);
        };
    }
  }, []);


  useEffect(() => {
    const initialTimestamp = new Date();
    const initialData: RealTimeEWasteDataPoint[] = Array.from({ length: 5 }, (_, i) => ({
      timestamp: format(addSeconds(initialTimestamp, i * -(REAL_TIME_EWASTE_UPDATE_INTERVAL/1000) * (5-i) ), 'HH:mm:ss'),
      volume: Math.floor(Math.random() * 20) + 5,
    })).slice(-MAX_REAL_TIME_EWASTE_POINTS);
    setRealTimeEWasteData(initialData);

    const interval = setInterval(() => {
      setRealTimeEWasteData((prevData) => {
        const newPoint = {
          timestamp: format(new Date(), 'HH:mm:ss'),
          volume: Math.floor(Math.random() * 70) + 10,
        };
        const updatedData = [...prevData, newPoint];
        return updatedData.slice(-MAX_REAL_TIME_EWASTE_POINTS);
      });
    }, REAL_TIME_EWASTE_UPDATE_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const generateDistribution = () => {
      const data: EWasteCategoryDistributionPoint[] = (Object.keys(eWasteCategoryColors) as Array<EWasteType | 'others'>).map(key => ({
        name: eWasteCategoryConfig[key].label as EWasteCategoryDistributionPoint['name'],
        value: Math.floor(Math.random() * 50) + 10,
        fill: eWasteCategoryConfig[key].color,
      }));
      setEWasteDistributionData(data);
    };
    generateDistribution();
  }, []);

  useEffect(() => {
    const now = new Date();
    const data: MonthlyEWasteDataPoint[] = Array.from({ length: 6 }).map((_, i) => {
      const monthDate = subMonths(now, 5 - i);
      return {
        month: format(monthDate, 'MMM'),
        volume: Math.floor(Math.random() * 200) + 50,
      };
    });
    setMonthlyEWasteVolume(data);
  }, []);

  const eWastePieChartConfig = useMemo(() => {
    return eWasteDistributionData.reduce((acc, cur) => {
      const key = Object.keys(eWasteCategoryConfig).find(k => eWasteCategoryConfig[k as EWasteType | 'others'].label === cur.name) || 'others';
      acc[key as keyof typeof acc] = {label: cur.name, color: cur.fill, icon: eWasteCategoryConfig[key as EWasteType | 'others'].icon };
      return acc;
    }, {} as import("@/components/ui/chart").ChartConfig);
  }, [eWasteDistributionData]);

  useEffect(() => {
    setIsLoading(true);
    setFirestoreDataError(null);
    const userId = 'user1'; // Replace with actual user ID from auth

    if (!firestore || Object.keys(firestore).length === 0) {
        const msg = "Firebase Firestore is not initialized. Please check your Firebase setup and environment variables.";
        setFirestoreDataError(msg);
        setIsLoading(false);
        setLiveWasteData([]); 
        return;
    }
    if (!userId) {
        const msg = "User ID not available. Cannot fetch waste data.";
        setFirestoreDataError(msg);
        setIsLoading(false);
        setLiveWasteData([]);
        return;
    }

    const wasteEntriesRef = collection(firestore, 'wasteEntries');
    const q = query(
      wasteEntriesRef,
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeFirestore = onSnapshot(q, (querySnapshot) => {
      const entries: WasteEntry[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        entries.push({
          id: doc.id,
          ...data,
          timestamp: (data.timestamp instanceof Timestamp) ? data.timestamp.toMillis() : Number(data.timestamp),
        } as WasteEntry);
      });
      setLiveWasteData(entries);
      setIsLoading(false);
      setFirestoreDataError(null);
    }, (error) => {
      console.error("Error fetching real-time waste entries:", error);
      const errorMsg = "Could not load live waste data. There might be a connection issue with the database or insufficient permissions. Please check your internet connection and Firebase setup.";
      setFirestoreDataError(errorMsg);
      toast({ variant: "destructive", title: "Data Fetch Error", description: errorMsg, duration: 10000 });
      setIsLoading(false);
    });

    return () => unsubscribeFirestore();
  }, [toast]);

  useEffect(() => {
    setIsLoadingSmartBins(true);
    setSmartBinsError(null);
    if (!database || Object.keys(database).length === 0) {
      setSmartBinsError("Firebase Realtime Database is not initialized. Please check your Firebase setup and environment variables.");
      setIsLoadingSmartBins(false);
      setSmartBinsData([]);
      return;
    }

    const binsRef = ref(database, 'bins');
    const listener = onValue(binsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const binsArray: BinData[] = Object.keys(data).map(key => ({
          id: key,
          ...data[key]
        }));
        setSmartBinsData(binsArray);
        setSmartBinsError(null);
      } else {
        setSmartBinsData([]);
      }
      setIsLoadingSmartBins(false);
    }, (error) => {
      console.error("Error fetching smart bins data:", error);
      setSmartBinsError("Could not load smart bin data. " + error.message);
      setIsLoadingSmartBins(false);
      toast({ variant: "destructive", title: "Smart Bin Error", description: "Failed to load data from Realtime Database." });
    });

    return () => {
      off(binsRef, 'value', listener);
    };
  }, [toast]);

  useEffect(() => {
    setIsLoadingBin1History(true);
    setBin1HistoryError(null);
    console.log(">>> [Dashboard - Bin1 History] useEffect triggered for /bin1 listener.");

    if (!database || Object.keys(database).length === 0) {
      const errorMsg = "Firebase Realtime Database is not initialized for Bin1 data. Please check your Firebase setup and environment variables.";
      console.error(">>> [Dashboard - Bin1 History] Error:", errorMsg);
      setBin1HistoryError(errorMsg);
      setIsLoadingBin1History(false);
      setBin1HistoryData([]);
      return;
    }

    const bin1NodeRef = ref(database, 'bin1'); // Listen to the parent /bin1 node
    console.log(">>> [Dashboard - Bin1 History] Setting up listener for path:", bin1NodeRef.toString());

    const listener = onValue(bin1NodeRef, (snapshot) => {
      const bin1NodeData = snapshot.val();
      console.log(">>> [Dashboard - Bin1 History] Raw data received from Firebase for /bin1:", JSON.stringify(bin1NodeData, null, 2));

      if (bin1NodeData && bin1NodeData.fill_level_history && Array.isArray(bin1NodeData.fill_level_history)) {
        const rawHistory = bin1NodeData.fill_level_history;
        const fillLevelHistoryIndex = bin1NodeData.fill_level_history_index;
        console.log(">>> [Dashboard - Bin1 History] Data is an array. Length:", rawHistory.length, "Index:", fillLevelHistoryIndex);
        
        if (rawHistory.length === 0) {
          console.log(">>> [Dashboard - Bin1 History] Received empty fill_level_history array. Setting chart data to empty.");
          setBin1HistoryData([]);
        } else {
          const filteredHistory = rawHistory.filter(
            (item: any) => item && typeof item.fill_level === 'number' && item.fill_level > 0
          );
          console.log(">>> [Dashboard - Bin1 History] Filtered history (fill_level > 0):", JSON.stringify(filteredHistory, null, 2));

          const chartData = filteredHistory.map((item: any, chartIndex: number) => ({
            index: chartIndex, // Use new index based on filtered data for chart X-axis
            fill_level: item.fill_level,
          }));
          
          console.log(">>> [Dashboard - Bin1 History] Processed chartData from Array:", JSON.stringify(chartData, null, 2));
          setBin1HistoryData(chartData);
        }
        // Log the conceptual "returned object"
        const processedReturnObject = {
            fill_level_history: filteredHistory, // Contains original objects with lat/lon etc.
            fill_level_history_index: fillLevelHistoryIndex
        };
        console.log(">>> [Dashboard - Bin1 History] Conceptual processed object with original index:", JSON.stringify(processedReturnObject, null, 2));
        setBin1HistoryError(null);
      } else {
        if (!bin1NodeData) {
            console.log(">>> [Dashboard - Bin1 History] Data for /bin1 is null or undefined.");
        } else if (!bin1NodeData.fill_level_history) {
            console.log(">>> [Dashboard - Bin1 History] fill_level_history field is missing in /bin1 data.");
        } else if (!Array.isArray(bin1NodeData.fill_level_history)) {
            console.log(">>> [Dashboard - Bin1 History] fill_level_history is not an array. Type:", typeof bin1NodeData.fill_level_history);
        }
        setBin1HistoryData([]);
      }
      setIsLoadingBin1History(false);
    }, (error) => {
      console.error(">>> [Dashboard - Bin1 History] Error fetching Bin1 data:", error);
      setBin1HistoryError("Could not load Bin1 data. " + error.message);
      setIsLoadingBin1History(false);
      toast({ variant: "destructive", title: "Bin1 History Error", description: "Failed to load data for Bin1." });
    });

    return () => {
      console.log(">>> [Dashboard - Bin1 History] Cleaning up listener for path:", bin1NodeRef.toString());
      off(bin1NodeRef, 'value', listener);
    };
  }, [toast]);


  useEffect(() => {
    let data = liveWasteData;
    if (dateRange?.from && dateRange?.to) {
      data = data.filter(entry => {
        if (!entry.timestamp) return false;
        const entryDate = new Date(entry.timestamp);
        return entryDate >= dateRange.from! && entryDate <= dateRange.to!;
      });
    }
    if (selectedWasteType !== 'all') {
      data = data.filter(entry => entry.type === selectedWasteType);
    }
    setFilteredData(data);
  }, [liveWasteData, dateRange, selectedWasteType]);

  const monthlyData = useMemo(() => {
    return filteredData.reduce((acc, entry) => {
      if (!entry.timestamp) return acc;
      const month = format(new Date(entry.timestamp), "MMM");
      if (!acc[month]) {
        acc[month] = { month };
        allWasteCategories.forEach(cat => acc[month][cat] = 0);
      }
      const quantity = typeof entry.quantity === 'number' ? entry.quantity : 0;
      acc[month][entry.type] = (acc[month][entry.type] || 0) + quantity;
      return acc;
    }, {} as Record<string, any>);
  }, [filteredData]);

  const barChartData = useMemo(() => Object.values(monthlyData), [monthlyData]);

  const categoryDistribution = useMemo(() => {
    return filteredData.reduce((acc, entry) => {
      const existing = acc.find(item => item.name === entry.type);
      const quantity = typeof entry.quantity === 'number' ? entry.quantity : 0;
      if (existing) {
        existing.value += quantity;
      } else {
        acc.push({ name: entry.type, value: quantity, fill: generalChartConfig[entry.type]?.color || generalChartConfig.other.color });
      }
      return acc;
    }, [] as { name: WasteCategory; value: number, fill: string }[]);
  }, [filteredData]);

  const totalWaste = useMemo(() => {
    return filteredData.reduce((sum, entry) => {
      const quantity = typeof entry.quantity === 'number' ? entry.quantity : 0;
      return sum + (entry.unit === 'items' ? quantity * 0.1 : quantity); 
    }, 0).toFixed(1);
  }, [filteredData]);

  const recycledPercentage = useMemo(() => {
    const totalValueForRecycledPercentage = categoryDistribution.reduce((sum, cat) => sum + cat.value, 0);
    if (totalValueForRecycledPercentage === 0) return '0';

    const recycledValue = categoryDistribution
      .filter(cat => ['recyclable', 'plastic', 'paper', 'cardboard', 'glass', 'metal', 'plasticPete', 'plasticHdpe', 'plasticPp'].includes(cat.name))
      .reduce((sum, cat) => sum + cat.value, 0);

    return ((recycledValue / totalValueForRecycledPercentage) * 100).toFixed(0);
  }, [categoryDistribution]);

  const generalPieOuterRadius = isMobileView ? 60 : 80;
  const eWastePieOuterRadius = isMobileView ? 68 : 85; 


  const renderPieLabel = ({ name, percent, x, y, midAngle, outerRadius: currentOuterRadius }: any) => {
    const labelRadiusOffset = isMobileView ? 10 : 15;
    const RADIAN = Math.PI / 180;
    const effectiveOuterRadius = typeof currentOuterRadius === 'number' ? currentOuterRadius : generalPieOuterRadius;
    const radius = effectiveOuterRadius + labelRadiusOffset;
    const lx = x + radius * Math.cos(-midAngle * RADIAN);
    const ly = y + radius * Math.sin(-midAngle * RADIAN);
    const textAnchor = lx > x ? 'start' : 'end';
    if ((isMobileView && percent * 100 < 12) || percent * 100 < 7) return null;
    return (
      <text x={lx} y={ly} fill="currentColor" textAnchor={textAnchor} dominantBaseline="central" className="text-[9px] sm:text-[10px] fill-foreground">
        {generalChartConfig[name as WasteCategory]?.label || name} (${(percent * 100).toFixed(0)}%)
      </text>
    );
  };

  const getBinStatusText = (bin: BinData): string => {
    if (bin.last_updated && differenceInHours(new Date(), new Date(bin.last_updated)) > 24) return "Offline";
    if (bin.notify) return "Notify";
    if (bin.fill_level >= 90) return "Full";
    if (bin.fill_level >= 70) return "Near Full";
    if (bin.fill_level >= 20) return "Filling";
    return "Empty";
  };

  const totalSmartBins = smartBinsData.length;
  const fullSmartBins = smartBinsData.filter(bin => bin.notify || bin.fill_level >= 90).length;
  const lowBatterySmartBins = smartBinsData.filter(bin => typeof bin.battery_level === 'number' && bin.battery_level < 20).length;

  return (
    <div className="space-y-4 sm:space-y-6"> {/* Reduced overall spacing */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <h1 className="text-xl sm:text-2xl font-bold text-primary">Waste Tracking Dashboard</h1> {/* Reduced title size */}
        <Button variant="outline" asChild size="sm">
            <Link href="/"><Edit className="mr-2 h-3 w-3 sm:h-4 sm:w-4" /> Back to Main Page</Link>
        </Button>
      </div>

      <Alert className="text-xs sm:text-sm">
        <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        <AlertTitle className="text-sm sm:text-base">Track Your Impact!</AlertTitle> {/* Reduced title size */}
        <AlertDescription>
          Visualize your general waste habits and e-waste trends. Data is updated in real-time from your logged entries or simulated for e-waste.
          Log items on the <Link href="/" className="font-medium text-primary hover:underline">home page</Link>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="pb-2 sm:pb-3"> {/* Reduced padding */}
          <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base"> {/* Reduced title size */}
            <Filter className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
            Filters (For General Waste)
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-2 sm:gap-3 p-3 sm:p-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant={"outline"}
                className={cn("w-full sm:w-auto justify-start text-left font-normal text-xs sm:text-sm", !dateRange && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "LLL dd, y")} -{" "}
                      {format(dateRange.to, "LLL dd, y")}
                    </>
                  ) : (
                    format(dateRange.from, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date range</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={isMobileView ? 1 : 2}
              />
            </PopoverContent>
          </Popover>
          <Select value={selectedWasteType} onValueChange={(value) => setSelectedWasteType(value as WasteCategory | 'all')}>
            <SelectTrigger className="w-full sm:w-[160px] text-xs sm:text-sm">
              <SelectValue placeholder="Select waste type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {allWasteCategories.map(cat => (
                <SelectItem key={cat} value={cat} className="capitalize text-xs sm:text-sm">{generalChartConfig[cat]?.label || cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex items-center justify-center h-32 sm:h-40"> {/* Reduced height */}
          <Loader2 className="h-6 w-6 sm:h-8 sm:w-8 text-primary animate-spin" />
          <p className="ml-2 sm:ml-3 text-xs sm:text-sm text-muted-foreground">Loading dashboard data...</p>
        </div>
      ) : firestoreDataError ? (
        <Alert variant="destructive" className="text-xs sm:text-sm">
            <WifiOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <AlertTitle className="text-sm sm:text-base">General Waste Data Error</AlertTitle>
            <AlertDescription>{firestoreDataError}</AlertDescription>
        </Alert>
      ) : (
        <>
          {liveWasteData.length === 0 && !isLoading && (
            <Alert variant="default" className="text-xs sm:text-sm">
              <Info className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <AlertTitle className="text-sm sm:text-base">No General Waste Data Yet</AlertTitle>
              <AlertDescription>
                No general waste entries found. Start logging on the <Link href="/" className="font-medium text-primary hover:underline">home page</Link>!
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-3"> {/* Adjusted grid for mobile */}
            <Card>
                <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-medium">Total General Waste Logged</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                    <div className="text-base sm:text-lg font-bold">{totalWaste} kg <span className="text-xs text-muted-foreground">(approx)</span></div> {/* Reduced font */}
                    <p className="text-xs text-muted-foreground">Across selected period</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-medium">Recycled Ratio (Est.)</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                    <div className="text-base sm:text-lg font-bold">{recycledPercentage}%</div> {/* Reduced font */}
                    <p className="text-xs text-muted-foreground">Recyclable types vs total</p>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-1">
                    <CardTitle className="text-xs font-medium">General Items Logged</CardTitle>
                </CardHeader>
                <CardContent className="p-2 sm:p-3">
                    <div className="text-base sm:text-lg font-bold">{filteredData.length}</div> {/* Reduced font */}
                    <p className="text-xs text-muted-foreground">Entries in selected period</p>
                </CardContent>
            </Card>
          </div>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-1 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                  <PieChartIconLucideGeneral className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  General Waste Category Distribution
                </CardTitle>
                <CardDescription className="text-xs">Overall breakdown of classified general items.</CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                {categoryDistribution.length > 0 ? (
                  <ChartContainer config={generalChartConfig} className="mx-auto aspect-square min-h-[180px] max-h-[180px] sm:min-h-[200px] sm:max-h-[200px] md:min-h-[220px] md:max-h-[220px]"> {/* Reduced height */}
                    <RechartsPieChart>
                      <RechartsTooltip content={<ChartTooltipContent nameKey="name" />} />
                      <Pie
                        data={categoryDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={generalPieOuterRadius}
                        labelLine={false}
                        label={renderPieLabel}
                      />
                      <RechartsLegend content={<ChartLegendContent nameKey="name" className="text-[8px] sm:text-[9px] [&>div]:gap-0.5 [&>div>svg]:size-2 mt-0 sm:mt-0.5" />} /> {/* Smaller legend */}
                    </RechartsPieChart>
                  </ChartContainer>
                ) : (
                  <div className="text-center py-4 sm:py-6 text-muted-foreground text-xs sm:text-sm">No general data for selected filters.</div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 sm:pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
                  <BarChartIconGeneral className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
                  Monthly General Classification Volume
                </CardTitle>
                <CardDescription className="text-xs">Volume of general items classified each month.</CardDescription>
              </CardHeader>
              <CardContent className="p-2 sm:p-3">
                {barChartData.length > 0 ? (
                  <ChartContainer config={generalChartConfig} className="h-[180px] sm:h-[200px] md:h-[220px] w-full"> {/* Reduced height */}
                    <RechartsBarChart data={barChartData} margin={{ top: 5, right: (isMobileView ? 0 : 5), left: (isMobileView ? -30 : -20), bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false}/>
                        <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={6} fontSize={isMobileView ? "0.55rem" : "0.65rem"} /> {/* Smaller font */}
                        <YAxis tickLine={false} axisLine={false} tickMargin={6} fontSize={isMobileView ? "0.55rem" : "0.65rem"} /> {/* Smaller font */}
                        <RechartsTooltip cursor={false} content={<ChartTooltipContent indicator="dashed" />} />
                        <RechartsLegend content={<ChartLegendContent nameKey="name" className="text-[8px] sm:text-[9px] [&>div]:gap-0.5 [&>div>svg]:size-2 mt-0 sm:mt-0.5"/>} /> {/* Smaller legend */}
                        {allWasteCategories.filter(cat => cat !== 'other' && generalChartConfig[cat]).map(cat => (
                          <Bar key={cat} dataKey={cat} stackId="a" fill={generalChartConfig[cat]?.color || generalChartConfig.other.color} name={generalChartConfig[cat]?.label as string} radius={cat === 'ewaste' || cat === 'recyclable' ? [3,3,0,0] : [0,0,0,0]}/>
                        ))}
                        <Bar dataKey="other" stackId="a" fill={generalChartConfig.other.color} name={generalChartConfig.other.label as string} radius={[0,0,3,3]}/>
                    </RechartsBarChart>
                  </ChartContainer>
                ) : (
                  <div className="text-center py-4 sm:py-6 text-muted-foreground text-xs sm:text-sm">No general data for selected filters.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <Card className="shadow-md mt-4 sm:mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 sm:pb-3">
          <CardTitle className="text-base font-semibold text-primary sm:text-lg">E-Waste Smart Bin Monitoring</CardTitle> {/* Reduced font */}
          <div className="text-xs sm:text-sm text-muted-foreground flex items-center">
            <Clock className="mr-1.5 h-3 w-3 sm:h-4 sm:w-4" />
            {currentTime ? format(currentTime, 'PP p') : 'Loading time...'}
          </div>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
            <Alert variant="default" className="bg-primary/5 text-xs sm:text-sm">
                <Server className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <AlertTitle className="text-sm sm:text-base text-primary">Live E-Waste Data (Simulated)</AlertTitle> {/* Reduced font */}
                <AlertDescription>
                This section displays simulated real-time e-waste data. Track volumes, categories, and monthly trends.
                </AlertDescription>
            </Alert>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:gap-4 md:grid-cols-1 lg:grid-cols-2">
        <Card className="shadow-md lg:col-span-2">
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
              <LineChartIcon className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              Real-Time E-Waste Volume
            </CardTitle>
            <CardDescription className="text-xs">Updates every {REAL_TIME_EWASTE_UPDATE_INTERVAL / 1000}s (simulated).</CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <ChartContainer config={{volume: {label: "Volume (kg)", color: "hsl(var(--primary))"}}} className="h-[160px] sm:h-[180px] md:h-[200px] w-full"> {/* Reduced height */}
              <RechartsLineChart data={realTimeEWasteData} margin={{ top: 5, right: 10, left: (isMobileView ? -25 : -10), bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                <XAxis
                  dataKey="timestamp"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  fontSize={isMobileView ? "0.55rem" : "0.65rem"}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  fontSize={isMobileView ? "0.55rem" : "0.65rem"}
                  domain={[0, 'dataMax + 10']}
                />
                <RechartsTooltip
                  cursor={{stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3"}}
                  content={<ChartTooltipContent indicator="line" nameKey="volume" labelKey="timestamp" />}
                />
                <RechartsLine
                  dataKey="volume"
                  type="monotone"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={true}
                  animationDuration={500}
                />
              </RechartsLineChart>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
              <PieChartIconLucideEWaste className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              E-Waste Category Distribution
            </CardTitle>
            <CardDescription className="text-xs">Proportion of e-waste types (simulated).</CardDescription>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 md:p-4"> {/* Updated Padding */}
            {eWasteDistributionData.length > 0 ? (
              <ChartContainer config={eWastePieChartConfig} className="mx-auto aspect-square min-h-[220px] max-h-[220px] sm:min-h-[220px] sm:max-h-[220px] md:min-h-[250px] md:max-h-[250px]"> {/* Increased mobile height */}
                <RechartsPieChart>
                  <RechartsTooltip content={<ChartTooltipContent nameKey="name" hideIndicator />} /> {/* Added hideIndicator */}
                  <Pie
                    data={eWasteDistributionData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={eWastePieOuterRadius} 
                    labelLine={false} 
                    label={{
                        fontSize: isMobileView ? '8px' : '10px', 
                        fill: '#FFFFFF', 
                        formatter: (value, entry) => `${(entry.payload.percent * 100).toFixed(0)}%`,
                      }}
                  >
                    {eWasteDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke={entry.fill} />
                    ))}
                  </Pie>
                  <RechartsLegend
                    content={<ChartLegendContent
                        nameKey="name"
                        className="text-[9px] sm:text-[10px] [&>div]:gap-1 [&>div>svg]:size-2.5 mt-1 sm:mt-1.5" 
                        payload={eWasteDistributionData.map(entry => ({
                            value: entry.name,
                            type: 'square',
                            id: entry.name,
                            color: entry.fill
                        }))}
                        hideIcon={true}
                    />}
                  />
                </RechartsPieChart>
              </ChartContainer>
            ) : (
              <div className="text-center py-4 sm:py-6 text-muted-foreground text-xs sm:text-sm">Loading e-waste distribution...</div>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-md">
          <CardHeader className="pb-2 sm:pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold sm:text-base">
              <BarChartIconEWaste className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
              Monthly E-Waste Collection
            </CardTitle>
            <CardDescription className="text-xs">E-waste volume (kg, simulated).</CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            <ChartContainer config={{volume: {label: "Volume (kg)", color: "hsl(var(--chart-3))"}}} className="h-[160px] sm:h-[180px] md:h-[200px] w-full"> {/* Reduced height */}
              <RechartsBarChart data={monthlyEWasteVolume} margin={{ top: 5, right: 5, left: (isMobileView ? -30 : -20), bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  fontSize={isMobileView ? "0.55rem" : "0.65rem"}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickMargin={6}
                  fontSize={isMobileView ? "0.55rem" : "0.65rem"}
                  domain={[0, 'dataMax + 20']}
                />
                <RechartsTooltip
                    cursor={{fill: "hsl(var(--muted)/0.5)"}}
                    content={<ChartTooltipContent indicator="rectangle" nameKey="volume" />}
                />
                <Bar dataKey="volume" radius={3}>
                    {monthlyEWasteVolume.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="hsl(var(--chart-3))" />
                    ))}
                </Bar>
              </RechartsBarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4 sm:mt-6 shadow-lg">
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-primary sm:text-lg">
            <Trash2 className="h-5 w-5 sm:h-6 sm:w-6" />
            General Smart Bin Monitoring
          </CardTitle>
          <CardDescription className="text-xs">
            Overview of connected smart bin statuses. Real-time data from IoT-enabled smart bins. The 'notify' status is updated by a Cloud Function.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoadingSmartBins ? (
            <div className="flex items-center justify-center py-4 sm:py-6">
              <Loader2 className="h-5 w-5 sm:h-7 sm:w-7 text-primary animate-spin mr-2" />
              <p className="text-muted-foreground text-xs sm:text-sm">Loading smart bin data...</p>
            </div>
          ) : smartBinsError ? (
            <Alert variant="destructive" className="text-xs sm:text-sm">
              <WifiOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <AlertTitle className="text-sm sm:text-base">Error Loading Smart Bins</AlertTitle>
              <AlertDescription>{smartBinsError}</AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-xs font-medium">Total Bins</CardTitle>
                    <Box className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent className="p-2">
                    <div className="text-lg sm:text-xl font-bold">{totalSmartBins}</div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-xs font-medium">Full / Needs Attention</CardTitle>
                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                  </CardHeader>
                  <CardContent className="p-2">
                    <div className="text-lg sm:text-xl font-bold">{fullSmartBins}</div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
                    <CardTitle className="text-xs font-medium">Low Battery</CardTitle>
                    <BatteryWarning className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-orange-500" />
                  </CardHeader>
                  <CardContent className="p-2">
                    <div className="text-lg sm:text-xl font-bold">{lowBatterySmartBins}</div>
                    <p className="text-xs text-muted-foreground">(Battery data if available)</p>
                  </CardContent>
                </Card>
              </div>

              {smartBinsData.length === 0 ? (
                 <Alert className="text-xs sm:text-sm">
                    <PackageX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    <AlertTitle className="text-sm sm:text-base">No Smart Bins Found</AlertTitle>
                    <AlertDescription>No general smart bin data available in the Realtime Database at the moment.</AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2 sm:space-y-3">
                  {smartBinsData.map((bin) => {
                    const binStatusText = getBinStatusText(bin);
                    const isOffline = bin.last_updated && differenceInHours(new Date(), new Date(bin.last_updated)) > 24;

                    let statusIcon;
                    let statusColorClass;
                    let progressColorClass;

                    if (isOffline) {
                        statusIcon = <WifiOff className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" />;
                        statusColorClass = "text-muted-foreground";
                        progressColorClass = "[&>div]:bg-muted";
                    } else if (bin.notify) {
                        statusIcon = <AlertCircleIcon className="h-3.5 w-3.5 text-destructive sm:h-4 sm:w-4" />;
                        statusColorClass = "text-destructive";
                        progressColorClass = "[&>div]:bg-destructive";
                    } else if (bin.fill_level >= 90) {
                        statusIcon = <TrashIcon className="h-3.5 w-3.5 text-destructive sm:h-4 sm:w-4" />;
                        statusColorClass = "text-destructive";
                        progressColorClass = "[&>div]:bg-destructive";
                    } else if (bin.fill_level >= 70) {
                        statusIcon = <CircleGauge className="h-3.5 w-3.5 text-orange-500 sm:h-4 sm:w-4" />;
                        statusColorClass = "text-orange-500";
                        progressColorClass = "[&>div]:bg-orange-500";
                    } else {
                        statusIcon = <PackageCheck className="h-3.5 w-3.5 text-green-600 sm:h-4 sm:w-4" />;
                        statusColorClass = "text-green-600";
                        progressColorClass = "[&>div]:bg-green-500";
                    }

                    return (
                        <Card
                        key={bin.id}
                        className={cn(
                            "p-2 sm:p-3 shadow-sm transition-all duration-300 ease-in-out border-l-4",
                            isOffline ? "border-muted" :
                            bin.notify || bin.fill_level >= 90 ? "border-destructive" :
                            bin.fill_level >= 70 ? "border-orange-500" :
                            "border-green-500",
                            isOffline ? "bg-muted/30" : "bg-card hover:shadow-md"
                        )}
                        >
                        <div className="flex flex-col sm:flex-row justify-between items-start gap-1 sm:gap-2">
                            <div className="flex-grow">
                            <h4 className={cn("font-semibold text-sm flex items-center gap-1.5", statusColorClass)}>
                                <Trash2 className="h-4 w-4 shrink-0" /> {/* Using Trash2Icon here */}
                                <span className="truncate" title={`Bin ID: ${bin.id}`}>Bin: {bin.id}</span>
                            </h4>
                            {bin.location && (
                                <p className="text-xs text-muted-foreground mt-0.5">
                                Lat: {bin.location.latitude.toFixed(3)}, Lon: {bin.location.longitude.toFixed(3)}
                                </p>
                            )}
                            </div>
                            <div className="flex flex-col items-start sm:items-end w-full sm:w-auto space-y-0.5 sm:space-y-1">
                            <div className={cn("text-sm w-full", "sm:w-24 md:w-32")}> {/* Responsive width */}
                                <div className="flex justify-between items-baseline mb-0.5">
                                <span className="font-medium text-muted-foreground text-xs">Fill Level:</span>
                                <span className={cn("font-bold text-base", statusColorClass)}> {/* Slightly larger font */}
                                    {bin.fill_level}%
                                </span>
                                </div>
                                <Progress
                                value={bin.fill_level}
                                className={cn("h-1 sm:h-1.5 rounded-full", progressColorClass)} // Thinner progress bar
                                aria-label={`Bin ${bin.id} fill level ${bin.fill_level}%`}
                                />
                            </div>

                            {typeof bin.battery_level === 'number' && (
                                <div className={cn("text-xs flex items-center", bin.battery_level < 20 ? "text-orange-500" : "text-muted-foreground")}>
                                {bin.battery_level < 20 ?
                                    <BatteryWarning className="h-3 w-3 mr-1 shrink-0" /> :
                                    <BatteryFull className="h-3 w-3 mr-1 shrink-0" />
                                }
                                Battery: {bin.battery_level}%
                                </div>
                            )}

                            <div className={cn("text-xs font-medium flex items-center px-1.5 py-0.5 rounded-md shadow-xs",
                                isOffline ? "bg-muted text-muted-foreground" :
                                bin.notify || bin.fill_level >= 90 ? "bg-destructive/10 text-destructive" :
                                bin.fill_level >= 70 ? "bg-orange-500/10 text-orange-600" :
                                "bg-green-600/10 text-green-700"
                            )}>
                                {statusIcon}
                                <span className="ml-1">Status: {isOffline ? "Offline" : binStatusText}</span>
                            </div>
                            </div>
                        </div>
                        <div className="mt-1 sm:mt-1.5 pt-1 sm:pt-1.5 border-t border-muted/20 text-xs text-muted-foreground space-y-0.5">
                            {typeof bin.lastEmptied === 'number' && bin.lastEmptied > 0 && (
                                <p>Last Emptied: {format(new Date(bin.lastEmptied), 'PP p')}</p>
                            )}
                            {typeof bin.last_updated === 'number' && bin.last_updated > 0 && (
                                <p>Last Updated: {format(new Date(bin.last_updated), 'PP p')} {isOffline ? "(Offline)" : ""}</p>
                            )}
                        </div>
                        </Card>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4 sm:mt-6 shadow-lg">
        <CardHeader className="pb-2 sm:pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold text-primary sm:text-lg">
            <LineChartIcon className="h-5 w-5 sm:h-6 sm:w-6" />
            Live Fill Level Trend - Bin 1
          </CardTitle>
          <CardDescription className="text-xs">
            Live-updating chart of fill levels for 'bin1' from Realtime Database.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          {isLoadingBin1History ? (
            <div className="flex items-center justify-center py-4 sm:py-6">
              <Loader2 className="h-5 w-5 sm:h-7 sm:w-7 text-primary animate-spin mr-2" />
              <p className="text-muted-foreground text-xs sm:text-sm">Loading Bin1 history data...</p>
            </div>
          ) : bin1HistoryError ? (
            <Alert variant="destructive" className="text-xs sm:text-sm">
              <WifiOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <AlertTitle className="text-sm sm:text-base">Error Loading Bin1 History</AlertTitle>
              <AlertDescription>{bin1HistoryError}</AlertDescription>
            </Alert>
          ) : bin1HistoryData.length === 0 ? (
            <Alert className="text-xs sm:text-sm">
                <PackageX className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <AlertTitle className="text-sm sm:text-base">No History for Bin1</AlertTitle>
                <AlertDescription>No fill level history data found for 'bin1/fill_level_history'.</AlertDescription>
            </Alert>
          ) : (
            <ChartContainer config={{fill_level: {label: "Fill Level (%)", color: "hsl(var(--primary))"}}} className="h-[200px] sm:h-[220px] md:h-[250px] w-full"> {/* Reduced height */}
              <RechartsLineChart
                data={bin1HistoryData}
                margin={{
                  top: 5,
                  right: isMobileView ? 5 : 20,
                  left: isMobileView ? -20 : 0,
                  bottom: isMobileView ? 15 : 10, // Adjusted bottom margin for mobile
                }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border)/0.5)" />
                <XAxis
                  dataKey="index"
                  type="number"
                  label={{ value: "Entry Index", position: 'insideBottom', dy: isMobileView ? 8 : 5, fontSize: isMobileView ? '0.5rem' : '0.6rem', fill: 'hsl(var(--muted-foreground))' }} // Smaller label
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  fontSize={isMobileView ? "0.5rem" : "0.6rem"} // Smaller tick font
                  domain={['dataMin', 'dataMax']}
                />
                <YAxis
                  dataKey="fill_level"
                  domain={[0, 100]}
                  label={{ value: "Fill Level (%)", angle: -90, position: 'insideLeft', dx: isMobileView ? 8 : 0, fontSize: isMobileView ? '0.5rem' : '0.6rem', fill: 'hsl(var(--muted-foreground))' }} // Smaller label
                  tickLine={false}
                  axisLine={false}
                  tickMargin={4}
                  fontSize={isMobileView ? "0.5rem" : "0.6rem"} // Smaller tick font
                />
                <RechartsTooltip
                  cursor={{stroke: "hsl(var(--primary))", strokeWidth: 1, strokeDasharray: "3 3"}}
                  content={<ChartTooltipContent indicator="line" nameKey="fill_level" labelKey="index" />}
                />

                <RechartsLine
                  type="monotone"
                  dataKey="fill_level"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  dot={{ r: isMobileView ? 1 : 2, fill: "hsl(var(--primary))" }} // Smaller dots on mobile
                  activeDot={{ r: isMobileView ? 2 : 4 }} // Smaller active dots on mobile
                  isAnimationActive={true}
                  animationDuration={300}
                />
              </RechartsLineChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    

    