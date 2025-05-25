
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Crown, Users, ShieldCheck, BarChart, Star, Loader2, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { firestore } from '@/lib/firebase';
import { collection, query, orderBy, limit, getDocs, where, documentId } from 'firebase/firestore';
import type { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

const defaultCurrentUserStats: UserProfile = {
  id: 'current-user',
  displayName: 'You',
  email: '',
  avatar: 'https://placehold.co/40x40.png?text=U',
  score: 0,
  itemsClassified: 0,
  challengesCompleted: 0,
  co2Managed: 0,
  totalEwaste: 0,
  totalPlastic: 0,
  totalBiowaste: 0,
  totalCardboard: 0,
  totalPaper: 0,
  totalGlass: 0,
  totalMetal: 0,
  totalOrganic: 0,
  totalOther: 0,
  totalPlasticOther: 0,
  totalPlasticPete: 0,
  totalPlasticHdpe: 0,
  totalPlasticPp: 0,
  totalPlasticPs: 0,
  badges: [],
};

export default function LeaderboardPage() {
  const [leaderboardData, setLeaderboardData] = useState<UserProfile[]>([]);
  const [currentUserStats, setCurrentUserStats] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchLeaderboardData = async () => {
      setIsLoading(true);
      setError(null);

      if (!firestore || Object.keys(firestore).length === 0) {
        setError("Firebase Firestore is not initialized. Please check your Firebase setup.");
        setIsLoading(false);
        return;
      }

      try {
        // Fetch current user's stats
        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
          const usersRef = collection(firestore, 'users');
          // Assuming email is unique and used as ID or a queryable field.
          // If ID is different from email, adjust query. For now, let's assume email is ID or a field.
          // Firestore doesn't directly support querying by email if it's not an ID or indexed field in a simple way for one doc.
          // A common pattern is to use UID as document ID. Let's assume email is used as a searchable field.
          // For simplicity in prototype, if user ID is email:
          // const userQuery = query(usersRef, where(documentId(), '==', userEmail), limit(1));

          // A more robust way if user IDs are not emails: query by email field
           const userQuery = query(usersRef, where('email', '==', userEmail), limit(1));
           const userSnapshot = await getDocs(userQuery);
          if (!userSnapshot.empty) {
            const userData = userSnapshot.docs[0].data() as UserProfile;
            setCurrentUserStats({ ...defaultCurrentUserStats, ...userData, displayName: userData.displayName || 'You' });
          } else {
            // Fallback if user not found in DB but is logged in via localStorage
             const localUserName = localStorage.getItem('userName') || userEmail.split('@')[0] || 'You';
             setCurrentUserStats({ ...defaultCurrentUserStats, email: userEmail, displayName: localUserName });
          }
        } else {
           setCurrentUserStats({ ...defaultCurrentUserStats, displayName: 'Guest (Log in to see your stats)'});
        }

        // Fetch top leaderboard users
        const leaderboardQuery = query(collection(firestore, 'users'), orderBy('score', 'desc'), limit(10));
        const querySnapshot = await getDocs(leaderboardQuery);
        const users: UserProfile[] = [];
        querySnapshot.forEach((doc) => {
          users.push({ id: doc.id, ...doc.data() } as UserProfile);
        });
        setLeaderboardData(users);

      } catch (e) {
        console.error("Error fetching leaderboard data: ", e);
        setError("Failed to load leaderboard data. Please try again later.");
        toast({
          variant: "destructive",
          title: "Leaderboard Error",
          description: "Could not fetch data from the server.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchLeaderboardData();
  }, [toast]);

  const getRankForCurrentUser = () => {
    if (!currentUserStats || !currentUserStats.id) return "N/A";
    const rankIndex = leaderboardData.findIndex(user => user.id === currentUserStats.id);
    if (rankIndex !== -1) {
      return rankIndex + 1;
    }
    // If user not in top 10, we can't show rank without fetching all users, so N/A for prototype
    return "N/A (Not in Top 10)";
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-12 w-12 text-primary animate-spin" />
        <p className="ml-3 text-lg text-muted-foreground">Loading Leaderboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <h1 className="text-2xl sm:text-3xl font-bold text-primary">Eco Leaderboard</h1>

      <Alert>
        <Star className="h-4 w-4" />
        <AlertTitle>Track Zero-Waste Champions!</AlertTitle>
        <AlertDescription>
          Rank users or neighborhoods based on their zero-waste contributions and reward eco-actions.
          Earn points by classifying waste on the <Link href="/" className="font-medium text-primary hover:underline">home page</Link>,
          completing <Link href="/challenges" className="font-medium text-primary hover:underline">challenges</Link>, and contributing to a zero-waste lifestyle.
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <ShieldCheck className="h-5 w-5 text-accent" />
              Your Eco Stats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm sm:text-base">
            {currentUserStats ? (
              <>
                <p><strong>User:</strong> {currentUserStats.displayName}</p>
                <p><strong>Score:</strong> {currentUserStats.score} points</p>
                <p><strong>Items Classified:</strong> {currentUserStats.itemsClassified}</p>
                <p><strong>Challenges Completed:</strong> {currentUserStats.challengesCompleted}</p>
                <p><strong>Your Rank:</strong> {getRankForCurrentUser()}</p>
                <Link href="/dashboard" className="text-sm text-primary hover:underline flex items-center mt-2">
                    <BarChart className="mr-1 h-4 w-4" /> View Your Dashboard
                </Link>
              </>
            ) : (
              <p className="text-muted-foreground">Log in to see your stats and rank!</p>
            )}
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Crown className="h-5 w-5 sm:h-6 sm:w-6 text-yellow-500" />
              Top Eco Champions
            </CardTitle>
             <CardDescription className="text-xs sm:text-sm">Top 10 users by score.</CardDescription>
          </CardHeader>
          <CardContent>
            {leaderboardData.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px] text-xs sm:text-sm">Rank</TableHead>
                    <TableHead className="text-xs sm:text-sm">User</TableHead>
                    <TableHead className="text-right text-xs sm:text-sm">Score</TableHead>
                    <TableHead className="hidden md:table-cell text-right text-xs sm:text-sm">Items</TableHead>
                    <TableHead className="hidden sm:table-cell text-right text-xs sm:text-sm">Challenges</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaderboardData.map((user, index) => (
                    <TableRow key={user.id || index}>
                      <TableCell className="font-medium text-sm sm:text-base">{index + 1}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7 sm:h-8 sm:w-8">
                            <AvatarImage src={user.avatar || `https://placehold.co/40x40.png?text=${user.displayName?.substring(0,1).toUpperCase() || 'U'}`} alt={user.displayName} data-ai-hint="avatar person" />
                            <AvatarFallback>{user.displayName?.substring(0, 2).toUpperCase() || 'U'}</AvatarFallback>
                          </Avatar>
                          <span className="text-sm sm:text-base truncate max-w-[100px] sm:max-w-[150px]">{user.displayName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-sm sm:text-base">{user.score}</TableCell>
                      <TableCell className="hidden md:table-cell text-right text-sm sm:text-base">{user.itemsClassified || 0}</TableCell>
                      <TableCell className="hidden sm:table-cell text-right text-sm sm:text-base">{user.challengesCompleted || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              !isLoading && <p className="text-muted-foreground text-center py-4">No users on the leaderboard yet. Be the first!</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
