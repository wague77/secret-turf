import React, { useState, useEffect, useCallback } from "react";
import { Calendar, RefreshCw, Trophy, Users, Clock, MapPin, Award, AlertTriangle, Info, WifiOff } from "lucide-react";

declare global {
  interface Window {
    nova?: {
      fetch: typeof fetch;
    };
  }
}

interface Reunion {
  numOfficiel: number;
  hippodrome: {
    libelleCourt: string;
  };
  courses: Course[];
}

interface Course {
  numOrdre: number;
  libelle: string;
  heureDepart: string;
  distance: number;
  discipline: string;
  nombreDeclaresPartants: number;
  paris: { codePari: string }[];
}

interface Participant {
  numPmu: number;
  nom: string;
  age: number;
  sexe: string;
  driver: string;
  entraineur: string;
  statut: string;
  musique: string;
  dernierRapportDirect?: {
    rapport: number;
  };
}

interface Pronostic {
  rang: number;
  num_partant: number;
  cote_prob: number;
}

interface Commentaire {
  texte: string;
}

interface CourseDetail {
  participants: Participant[];
  pronostics?: Pronostic[];
  commentaire?: Commentaire;
}

const BASE_URL = "https://offline.turfinfo.api.pmu.fr/rest/client/7/programme";

const getTodayDate = (): string => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `${dd}${mm}${yyyy}`;
};

const formatTime = (timeStr: string | null | undefined): string => {
  const str = String(timeStr ?? "");
  if (str.length >= 5) {
    return str.substring(0, 5);
  }
  return str || "00:00";
};

const cleanCote = (cote?: number | null): string => {
  if (typeof cote !== 'number' || isNaN(cote)) return "–";
  return cote.toFixed(1).replace('.', ',');
};

const getJeuxForCourse = (paris: { codePari: string }[] = []): string[] => {
  const codes = paris.map(p => p.codePari.toUpperCase());
  const jeux: string[] = [];

  if (codes.includes('E_GAGNANT') || codes.includes('GAGNANT')) jeux.push('Simple Gagnant');
  if (codes.includes('E_PLACE') || codes.includes('PLACE')) jeux.push('Simple Placé');
  if (codes.includes('E_COUPLE') || codes.includes('COUPLE')) jeux.push('Couplé');
  if (codes.includes('E_2SUR4') || codes.includes('2SUR4')) jeux.push('2 sur 4');
  if (codes.includes('E_TRIO') || codes.includes('TRIO')) jeux.push('Trio');
  if (codes.includes('E_TIERCE') || codes.includes('TIERCE')) jeux.push('Tiercé');
  if (codes.includes('E_SUPER4') || codes.includes('SUPER4')) jeux.push('Super 4');
  if (codes.includes('E_QUARTE') || codes.includes('QUARTE')) jeux.push('Quarté+');
  if (codes.includes('E_MULTI') || codes.includes('MULTI')) jeux.push('Multi');
  if (codes.includes('E_QUINTE') || codes.includes('QUINTE')) jeux.push('Quinté+');
  if (codes.includes('E_PICK5') || codes.includes('PICK5')) jeux.push('Pick 5');

  return jeux.length > 0 ? jeux : ['Simple Gagnant', 'Couplé', 'Trio'];
};

export default function PartantsPMU() {
  const [date, setDate] = useState(getTodayDate());
  const [reunions, setReunions] = useState<Reunion[]>([]);
  const [selectedReunion, setSelectedReunion] = useState<number | null>(null);
  const [selectedCourseNum, setSelectedCourseNum] = useState<number | null>(null);
  const [courseDetail, setCourseDetail] = useState<CourseDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [novaReady, setNovaReady] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const fetchWithNova = async (url: string): Promise<any> => {
    if (!window.nova?.fetch) {
      throw new Error("window.nova.fetch n'est pas disponible. L'application attend l'environnement Android.");
    }
    try {
      console.log("[PMU] Fetching:", url);
      const response = await window.nova.fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });
      console.log("[PMU] Status:", response.status);
      if (!response.ok) {
        const text = await response.text().catch(() => "No body");
        console.error("[PMU] Error body:", text);
        throw new Error(`Erreur HTTP ${response.status}`);
      }
      const data = await response.json();
      console.log("[PMU] Data keys:", Object.keys(data));
      return data;
    } catch (err: any) {
      console.error("[PMU] Fetch error:", err.message || err);
      throw err;
    }
  };

  const loadProgramme = useCallback(async (selectedDate: string, isRetry = false) => {
    setLoading(true);
    setError(null);
    setSelectedReunion(null);
    setSelectedCourseNum(null);
    setCourseDetail(null);
    setReunions([]);

    if (!novaReady && !window.nova?.fetch) {
      setError("L'environnement Android (window.nova) n'est pas encore prêt. Appuyez sur Actualiser dans quelques secondes.");
      setLoading(false);
      return;
    }

    try {
      const url = `${BASE_URL}/${selectedDate}`;
      console.log("[PMU] Loading programme for", selectedDate, `(retry ${retryCount})`);
      const data = await fetchWithNova(url);

      if (data?.programme?.reunions && Array.isArray(data.programme.reunions) && data.programme.reunions.length > 0) {
        console.log("[PMU] Success -", data.programme.reunions.length, "réunions chargées");
        setReunions(data.programme.reunions);
        setSelectedReunion(data.programme.reunions[0].numOfficiel);
        setError(null);
        setRetryCount(0);
      } else {
        console.warn("[PMU] No reunions found");
        setError("Aucune réunion disponible pour cette date. Essayez une autre date (ex. hier ou demain) ou réessayez plus tard.");
        setReunions([]);
      }
    } catch (err: any) {
      console.error("[PMU] Load error:", err.message);
      const msg = err.message.includes("nova.fetch") 
        ? "window.nova.fetch n'est pas disponible. Vérifiez que l'application est bien lancée via NOVA Studio sur Android."
        : `Impossible de charger le programme : ${err.message}`;
      setError(msg);
      setReunions([]);
    } finally {
      setLoading(false);
    }
  }, [novaReady, retryCount]);

  const loadCourseDetails = useCallback(async (reunionNum: number, courseNum: number) => {
    if (!novaReady) return;
    setLoading(true);
    setError(null);
    setCourseDetail(null);

    try {
      const base = `${BASE_URL}/${date}`;
      console.log(`[PMU] Loading details R${reunionNum} C${courseNum}`);

      const partUrl = `${base}/R${reunionNum}/C${courseNum}/participants`;
      const partData = await fetchWithNova(partUrl);
      const participants = Array.isArray(partData?.participants) ? partData.participants : [];

      let pronostics: Pronostic[] = [];
      try {
        const pronUrl = `${base}/R${reunionNum}/C${courseNum}/pronostics`;
        const pronData = await fetchWithNova(pronUrl);
        if (Array.isArray(pronData?.selection)) pronostics = pronData.selection;
      } catch (e) { console.warn("[PMU] No pronostics"); }

      let commentaire: Commentaire | undefined;
      try {
        const commUrl = `${base}/R${reunionNum}/C${courseNum}/pronostics-detailles`;
        const commData = await fetchWithNova(commUrl);
        if (commData?.commentaire?.texte) commentaire = commData.commentaire;
      } catch (e) { console.warn("[PMU] No comment"); }

      const sortedParticipants = [...participants].sort((a, b) => a.numPmu - b.numPmu);
      const sortedPronostics = [...pronostics].sort((a, b) => a.rang - b.rang);

      setCourseDetail({
        participants: sortedParticipants,
        pronostics: sortedPronostics.length > 0 ? sortedPronostics : undefined,
        commentaire,
      });
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(`Impossible de charger les détails : ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [date, novaReady]);

  // Check for nova readiness
  useEffect(() => {
    const checkNova = () => {
      if (window.nova?.fetch) {
        console.log("[PMU] window.nova.fetch is now available!");
        setNovaReady(true);
        return true;
      }
      return false;
    };

    // Immediate check
    if (checkNova()) {
      loadProgramme(date);
      return;
    }

    // Poll every 500ms (max 15 seconds)
    const interval = setInterval(() => {
      if (checkNova()) {
        clearInterval(interval);
        loadProgramme(date);
      }
    }, 500);

    // Timeout after 12 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      if (!window.nova?.fetch) {
        console.error("[PMU] window.nova never became available");
        setError("Impossible de communiquer avec l'environnement Android (window.nova.fetch manquant). L'application doit être lancée depuis NOVA Studio.");
        setNovaReady(false);
      }
    }, 12000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, []);

  // Auto load when nova becomes ready
  useEffect(() => {
    if (novaReady && reunions.length === 0 && !loading && !error) {
      loadProgramme(date);
    }
  }, [novaReady, loadProgramme, date, reunions.length, loading, error]);

  // Auto load course details
  useEffect(() => {
    if (selectedReunion !== null && selectedCourseNum !== null && novaReady) {
      const reunion = reunions.find(r => r.numOfficiel === selectedReunion);
      if (reunion && reunion.courses.some(c => c.numOrdre === selectedCourseNum)) {
        loadCourseDetails(selectedReunion, selectedCourseNum);
      }
    }
  }, [selectedReunion, selectedCourseNum, reunions, loadCourseDetails, novaReady]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputDate = e.target.value;
    if (inputDate) {
      const newDate = inputDate.replace(/-/g, '');
      if (newDate.length === 8) {
        setDate(newDate);
      }
    }
  };

  const refreshData = async () => {
    setRetryCount(c => c + 1);
    setRefreshing(true);
    await loadProgramme(date, true);
    setRefreshing(false);
  };

  const selectedReunionData = reunions.find(r => r.numOfficiel === selectedReunion);
  const selectedCourse = selectedReunionData?.courses.find(c => c.numOrdre === selectedCourseNum);

  const jeuxProposes = selectedCourse ? getJeuxForCourse(selectedCourse.paris) : [];

  const getPronosticChevaux = () => {
    if (!courseDetail?.pronostics || !Array.isArray(courseDetail.participants)) return [];
    return courseDetail.pronostics.map(p => {
      const part = courseDetail.participants.find(pa => pa.numPmu === p.num_partant);
      return {
        ...p,
        nom: part?.nom || 'Inconnu',
      };
    });
  };

  const pronosticChevaux = getPronosticChevaux();

  const getCombinaisonForJeu = (jeu: string, pronos: typeof pronosticChevaux) => {
    if (!Array.isArray(pronos) || pronos.length === 0) return "–";
    const nums = pronos.map(p => p.num_partant);
    if (jeu.includes('Simple') || jeu.includes('Gagnant') || jeu.includes('Placé')) {
      return nums[0] ? `${nums[0]}` : "–";
    }
    if (jeu.includes('Couplé') || jeu.includes('2 sur 4')) {
      return nums.slice(0, 2).join(' - ');
    }
    if (jeu.includes('Trio') || jeu.includes('Tiercé')) {
      return nums.slice(0, 3).join(' - ');
    }
    return nums.slice(0, 4).join(' - ');
  };

  return (
    <div className="min-h-screen bg-[#0A1F0A] text-[#E8D5A3] font-sans">
      {/* Header */}
      <header className="bg-[#0F2A0F] border-b border-[#D4AF37] sticky top-0 z-50 shadow-lg">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#D4AF37] to-[#B8972E] rounded-2xl flex items-center justify-center shadow-inner">
              <Trophy className="w-6 h-6 text-[#0A1F0A]" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tighter text-white">PARTANTS PMU</h1>
              <p className="text-xs text-[#D4AF37]/70 -mt-1 flex items-center gap-1.5">
                Turf • Pronos • Live 
                {novaReady && <span className="text-emerald-400 text-[10px] font-mono">● CONNECTÉ</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center bg-[#132913] border border-[#D4AF37]/30 rounded-xl px-4 py-2 text-sm">
              <Calendar className="w-4 h-4 mr-2 text-[#D4AF37]" />
              <input
                type="date"
                value={`${date.substring(4,8)}-${date.substring(2,4)}-${date.substring(0,2)}`}
                onChange={handleDateChange}
                className="bg-transparent outline-none text-[#E8D5A3] cursor-pointer w-28"
              />
            </div>

            <button
              onClick={refreshData}
              disabled={refreshing || loading}
              className="flex items-center gap-2 bg-[#D4AF37] hover:bg-[#E8C55A] text-[#0A1F0A] font-semibold px-5 py-2.5 rounded-2xl transition-all active:scale-95 disabled:opacity-70 shadow-md"
            >
              <RefreshCw className={`w-4 h-4 ${(refreshing || loading) ? 'animate-spin' : ''}`} />
              <span className="text-sm">ACTUALISER</span>
            </button>
          </div>
        </div>

        {reunions.length > 0 && (
          <div className="max-w-5xl mx-auto px-6 pb-3 overflow-x-auto hide-scrollbar">
            <div className="flex gap-2 py-1">
              {reunions.map((reunion) => (
                <button
                  key={reunion.numOfficiel}
                  onClick={() => {
                    setSelectedReunion(reunion.numOfficiel);
                    setSelectedCourseNum(reunion.courses?.[0]?.numOrdre || null);
                  }}
                  className={`flex-shrink-0 px-5 py-2.5 rounded-2xl text-sm font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                    selectedReunion === reunion.numOfficiel
                      ? 'bg-[#D4AF37] text-[#0A1F0A] shadow-lg'
                      : 'bg-[#132913] border border-[#D4AF37]/30 hover:border-[#D4AF37] text-[#E8D5A3]'
                  }`}
                >
                  <span className="font-mono text-xs opacity-70">R{reunion.numOfficiel}</span>
                  <span>{reunion.hippodrome.libelleCourt}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 flex gap-6">
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0">
          <div className="bg-[#132913] border border-[#D4AF37]/20 rounded-3xl p-5 sticky top-28">
            <div className="flex items-center justify-between mb-5">
              <div className="uppercase text-xs tracking-[1px] font-bold text-[#D4AF37]">COURSES DU JOUR</div>
              {selectedReunionData && (
                <div className="text-xs px-3 py-1 bg-[#0A1F0A] rounded-full text-[#D4AF37]">
                  {selectedReunionData.hippodrome.libelleCourt}
                </div>
              )}
            </div>

            {loading && reunions.length === 0 && (
              <div className="py-12 flex flex-col items-center text-[#D4AF37]/60">
                <div className="animate-spin w-8 h-8 border-2 border-[#D4AF37] border-t-transparent rounded-full mb-4"></div>
                <p>Connexion à l'API PMU...</p>
                <p className="text-xs mt-4 opacity-60">Initialisation de window.nova • {novaReady ? "Prêt" : "En attente"}</p>
              </div>
            )}

            {error && reunions.length === 0 && (
              <div className="bg-red-950/40 border border-red-500/30 rounded-2xl p-6 text-center">
                <div className="mx-auto mb-4 flex justify-center">
                  {error.includes("nova.fetch") || error.includes("window.nova") ? (
                    <WifiOff className="w-10 h-10 text-red-400" />
                  ) : (
                    <AlertTriangle className="w-10 h-10 text-red-400" />
                  )}
                </div>
                <p className="text-red-200 text-sm leading-relaxed whitespace-pre-line">{error}</p>
                
                <button
                  onClick={refreshData}
                  className="mt-6 w-full py-3 text-sm font-medium bg-[#D4AF37] hover:bg-amber-300 active:bg-amber-400 text-[#0A1F0A] rounded-2xl transition-colors"
                >
                  RÉESSAYER MAINTENANT
                </button>
                
                <div className="mt-6 text-[10px] text-red-400/70">
                  Si le problème persiste, assurez-vous que l'application est bien installée via l'atelier NOVA Studio sur Android.
                </div>
              </div>
            )}

            {!loading && reunions.length > 0 && selectedReunionData && (
              <div className="space-y-1 max-h-[560px] overflow-y-auto pr-2 custom-scroll">
                {selectedReunionData.courses.map((course) => (
                  <button
                    key={course.numOrdre}
                    onClick={() => setSelectedCourseNum(course.numOrdre)}
                    className={`w-full text-left px-5 py-4 rounded-2xl transition-all group flex items-center gap-4 border ${
                      selectedCourseNum === course.numOrdre
                        ? 'bg-[#1E3A1E] border-[#D4AF37] shadow-inner'
                        : 'hover:bg-[#1A2F1A] border-transparent'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-2xl bg-[#D4AF37]/10 flex items-center justify-center text-[#D4AF37] font-mono text-lg flex-shrink-0 group-hover:scale-110 transition-transform">
                      {course.numOrdre}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-[#D4AF37]/70" />
                        <span className="font-mono text-[#E8D5A3] text-base font-semibold tracking-tight">
                          {formatTime(course.heureDepart)}
                        </span>
                      </div>
                      <div className="text-sm text-[#E8D5A3] line-clamp-1 font-medium mt-0.5">
                        {course.libelle}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-[#D4AF37]/60 mt-1">
                        <span>{course.distance}m</span>
                        <span className="uppercase">{course.discipline}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-xs bg-[#0A1F0A] text-[#D4AF37] px-2.5 py-px rounded font-mono">
                        {course.nombreDeclaresPartants}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!selectedReunionData && reunions.length > 0 && (
              <div className="py-10 text-center text-[#D4AF37]/40 text-sm">
                Sélectionnez une réunion
              </div>
            )}
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1">
          {!selectedCourse && !loading && !error && reunions.length === 0 && (
            <div className="h-[520px] flex flex-col items-center justify-center border border-dashed border-[#D4AF37]/30 rounded-3xl bg-[#132913]/30">
              <div className="w-16 h-16 bg-[#1E3A1E] rounded-3xl flex items-center justify-center mb-6">
                <Trophy className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <p className="text-2xl text-[#D4AF37]/80 font-light">Initialisation de l'application</p>
              <p className="text-sm max-w-xs text-center mt-4 text-[#D4AF37]/50">
                Connexion à window.nova.fetch en cours...<br />
                Appuyez sur <span className="font-mono text-[#D4AF37]">ACTUALISER</span> si l'écran reste bloqué.
              </p>
              {!novaReady && (
                <div className="mt-8 text-xs font-mono text-[#D4AF37]/30">En attente de l'environnement Android</div>
              )}
            </div>
          )}

          {!selectedCourse && !loading && !error && reunions.length > 0 && (
            <div className="h-96 flex flex-col items-center justify-center border border-dashed border-[#D4AF37]/30 rounded-3xl">
              <div className="w-16 h-16 bg-[#1E3A1E] rounded-3xl flex items-center justify-center mb-6">
                <Trophy className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <p className="text-xl text-[#D4AF37]/70 font-light">Sélectionnez une course</p>
              <p className="text-sm max-w-xs text-center mt-3 text-[#D4AF37]/40">
                Choisissez une réunion puis une course pour voir les partants et pronostics
              </p>
            </div>
          )}

          {selectedCourse && courseDetail && (
            <>
              <div className="bg-gradient-to-br from-[#1E3A1E] to-[#132913] border border-[#D4AF37]/40 rounded-3xl p-8 mb-8 shadow-2xl">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="inline-flex items-center gap-2 bg-[#0A1F0A] text-[#D4AF37] text-xs tracking-widest px-4 py-1 rounded-3xl mb-3">
                      COURSE {selectedCourse.numOrdre} • R{selectedReunion}
                    </div>
                    <h2 className="text-4xl font-bold text-white leading-none tracking-tighter mb-2">
                      {selectedCourse.libelle}
                    </h2>
                    <div className="flex items-center gap-6 text-sm mt-6">
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-[#D4AF37]" />
                        <span className="font-semibold text-[#E8D5A3]">{formatTime(selectedCourse.heureDepart)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-5 h-5 text-[#D4AF37]" />
                        <span>{selectedReunionData?.hippodrome.libelleCourt}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-[#D4AF37]" />
                        <span>{selectedCourse.distance} mètres • {selectedCourse.discipline}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Users className="w-5 h-5 text-[#D4AF37]" />
                        <span>{selectedCourse.nombreDeclaresPartants} partants</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-[#D4AF37]/60">DÉPART DANS</div>
                    <div className="text-6xl font-mono font-bold text-[#D4AF37] tabular-nums tracking-tighter mt-1">18</div>
                    <div className="text-xs -mt-1 text-[#D4AF37]/50">minutes</div>
                  </div>
                </div>
              </div>

              <div className="mb-10">
                <div className="flex items-center gap-3 mb-4 px-1">
                  <Award className="w-6 h-6 text-[#D4AF37]" />
                  <h3 className="text-2xl font-semibold tracking-tight text-white">Pronostic PMU</h3>
                </div>

                <div className="bg-[#132913] border border-[#D4AF37]/30 rounded-3xl p-8">
                  <div className="mb-8">
                    <div className="uppercase text-xs font-bold tracking-widest text-[#D4AF37]/70 mb-4">SÉLECTION CLASSÉE</div>
                    <div className="space-y-3">
                      {pronosticChevaux.length > 0 ? (
                        pronosticChevaux.slice(0, 5).map((p, idx) => (
                          <div key={idx} className="flex items-center bg-[#0F2A0F] rounded-2xl px-6 py-4 border border-[#D4AF37]/10">
                            <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-[#D4AF37] to-amber-600 flex items-center justify-center text-[#0A1F0A] font-bold text-lg mr-6">
                              {p.rang}
                            </div>
                            <div className="flex-1">
                              <div className="font-semibold text-white text-xl">N°{p.num_partant} — {p.nom}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs text-[#D4AF37]/60">COTE PROBABLE</div>
                              <div className="text-3xl font-mono font-bold text-[#D4AF37]">{cleanCote(p.cote_prob)}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8 text-[#D4AF37]/40">Aucun pronostic disponible pour cette course</div>
                      )}
                    </div>
                  </div>

                  {courseDetail.commentaire?.texte && (
                    <div className="mb-8 border-t border-[#D4AF37]/20 pt-8">
                      <div className="uppercase text-xs font-bold tracking-widest text-[#D4AF37]/70 mb-3">COMMENTAIRE DE L'EXPERT</div>
                      <div className="text-[#E8D5A3] leading-relaxed text-[15px] italic">
                        « {courseDetail.commentaire.texte} »
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="uppercase text-xs font-bold tracking-widest text-[#D4AF37]/70 mb-5">COMBINAISONS RECOMMANDÉES</div>
                    <div className="grid grid-cols-2 gap-4">
                      {jeuxProposes.map((jeu, index) => (
                        <div key={index} className="bg-[#0F2A0F] border border-[#D4AF37]/20 rounded-2xl p-6">
                          <div className="font-semibold text-[#D4AF37] text-sm mb-3 tracking-wider">{jeu.toUpperCase()}</div>
                          <div className="text-4xl font-bold text-white font-mono tracking-[-2px]">
                            {getCombinaisonForJeu(jeu, pronosticChevaux)}
                          </div>
                          <div className="text-[10px] text-[#D4AF37]/50 mt-4">Sélection des meilleurs pronos</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-5 px-1">
                  <h3 className="text-2xl font-semibold tracking-tight text-white flex items-center gap-3">
                    <Users className="w-6 h-6 text-[#D4AF37]" /> LES PARTANTS
                  </h3>
                  <div className="text-xs bg-[#1E3A1E] px-4 py-1 rounded-3xl text-[#D4AF37]">Classés par numéro</div>
                </div>

                <div className="space-y-4">
                  {courseDetail.participants.map((partant) => {
                    const isNonPartant = partant.statut && !partant.statut.toLowerCase().includes('partant');
                    const cote = partant.dernierRapportDirect?.rapport;
                    
                    return (
                      <div
                        key={partant.numPmu}
                        className={`border rounded-3xl p-6 flex gap-7 items-start transition-all ${
                          isNonPartant 
                            ? 'bg-[#0A1F0A] border-[#4A3F2A] opacity-60' 
                            : 'bg-[#132913] border-[#D4AF37]/30 hover:border-[#D4AF37]'
                        }`}
                      >
                        <div className={`w-14 h-14 flex-shrink-0 rounded-2xl flex items-center justify-center text-4xl font-bold shadow-inner ${
                          isNonPartant 
                            ? 'bg-[#3A2F1F] text-[#9C8B5E]' 
                            : 'bg-gradient-to-br from-[#D4AF37] to-[#B8972E] text-[#0F2A0F]'
                        }`}>
                          {partant.numPmu}
                        </div>

                        <div className="flex-1 pt-1">
                          <div className="flex justify-between">
                            <div>
                              <div className={`text-2xl font-semibold ${isNonPartant ? 'line-through text-[#9C8B5E]' : 'text-white'}`}>
                                {partant.nom}
                              </div>
                              <div className="text-sm text-[#D4AF37]/60 mt-1">
                                {partant.age} ans • {partant.sexe} • {partant.musique || '–'}
                              </div>
                            </div>
                            
                            <div className="text-right">
                              {isNonPartant ? (
                                <div className="inline-block text-xs font-medium bg-red-900/70 text-red-200 px-4 py-1 rounded-2xl">NON PARTANT</div>
                              ) : (
                                <div>
                                  <div className="text-xs text-[#D4AF37]/60">COTE</div>
                                  <div className="text-4xl font-mono font-bold text-[#E8D5A3]">{cleanCote(cote)}</div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-6 text-sm">
                            <div>
                              <span className="text-[#D4AF37]/50 text-xs">DRIVER / JOCKEY</span><br />
                              <span className="text-[#E8D5A3]">{partant.driver || '–'}</span>
                            </div>
                            <div>
                              <span className="text-[#D4AF37]/50 text-xs">ENTRAÎNEUR</span><br />
                              <span className="text-[#E8D5A3]">{partant.entraineur || '–'}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {loading && selectedCourse && (
            <div className="py-20 flex flex-col items-center">
              <div className="w-9 h-9 border-4 border-[#D4AF37] border-t-transparent animate-spin rounded-full mb-6"></div>
              <p className="text-[#D4AF37]">Chargement des partants et pronostics...</p>
            </div>
          )}
        </div>
      </div>

      <footer className="bg-[#0A1F0A] border-t border-[#D4AF37]/20 py-10">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-[#132913] text-[#D4AF37] text-xs px-6 py-3 rounded-3xl">
              <Info className="w-4 h-4" />
              INFORMATION
            </div>
          </div>
          
          <p className="max-w-lg mx-auto text-xs leading-relaxed text-[#D4AF37]/60">
            Jouer comporte des risques : endettement, dépendance… Appelez le <span className="font-mono text-[#E8D5A3]">09 74 75 13 13</span> (appel non surtaxé).
            <br />Cette application est à titre informatif. Les cotes sont indicatives et peuvent varier.
          </p>
          
          <div className="mt-10 text-[10px] text-[#D4AF37]/30">Données fournies par l’API Turfinfo PMU • NOVA Studio</div>
        </div>
      </footer>
    </div>
  );
}
