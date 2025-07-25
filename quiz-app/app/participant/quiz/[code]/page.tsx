"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Clock, Trophy, CheckCircle, XCircle } from "lucide-react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"

interface Question {
  id: string
  question: string
  type: "multiple-choice" | "true-false" | "short-answer"
  options?: string[]
  timeLimit: number
  points: number
  correct_answer?: string | number
}

interface PlayerStats {
  score: number
  streak: number
  accuracy: number
  position: number
  totalAnswered: number
  correctAnswers: number
}

export default function ParticipantQuiz() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const playerName = searchParams.get("name") || "Anonymous"
  const quizCode = params.code as string

  const [gameState, setGameState] = useState<"waiting" | "active" | "answered" | "results" | "completed">("waiting")
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [selectedAnswer, setSelectedAnswer] = useState<string | number | null>(null)
  const [timeRemaining, setTimeRemaining] = useState(30)
  const [showFeedback, setShowFeedback] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [powerUps, setPowerUps] = useState({ fiftyFifty: 1, extraTime: 1, doublePoints: 1 })
  const [activePowerUp, setActivePowerUp] = useState<string | null>(null)

  const [playerStats, setPlayerStats] = useState<PlayerStats>({
    score: 0,
    streak: 0,
    accuracy: 0,
    position: 1,
    totalAnswered: 0,
    correctAnswers: 0,
  })

  const [proctorViolations, setProctorViolations] = useState(0)
  const [showProctorModal, setShowProctorModal] = useState(false)
  const [proctorTimer, setProctorTimer] = useState(10)
  const proctorIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const violationTriggeredRef = useRef(false)

  const [questions, setQuestions] = useState<Question[]>([])
  const [questionIndex, setQuestionIndex] = useState(0)

  // Fetch questions for this session on mount
  useEffect(() => {
    async function fetchQuestions() {
      const res = await fetch(`/api/sessions/questions?code=${quizCode}`)
      if (res.ok) {
        const data = await res.json()
        setQuestions(data.questions)
        setCurrentQuestion(data.questions[0] || null)
        setQuestionIndex(0)
      } else {
        toast({ title: 'Failed to load questions', description: 'Please try again.' })
      }
    }
    fetchQuestions()
  }, [quizCode])

  // When moving to next question, update currentQuestion
  useEffect(() => {
    if (questions.length > 0 && questionIndex < questions.length) {
      setCurrentQuestion(questions[questionIndex])
      setTimeRemaining(questions[questionIndex].timeLimit)
    }
  }, [questionIndex, questions])

  useEffect(() => {
    // Simulate receiving question from host
    if (gameState === "waiting" && questions.length > 0 && questionIndex < questions.length) {
      setTimeout(() => {
        setCurrentQuestion(questions[questionIndex])
        setGameState("active")
        setTimeRemaining(questions[questionIndex].timeLimit)
      }, 2000)
    }
    if (gameState === "waiting" && questionIndex >= questions.length) {
      setGameState("completed")
    }
  }, [gameState, questions, questionIndex])

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (gameState === "active" && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => prev - 1)
      }, 1000)
    } else if (timeRemaining === 0 && gameState === "active") {
      handleTimeUp()
    }
    return () => clearInterval(interval)
  }, [gameState, timeRemaining])

  const usePowerUp = (powerUp: string) => {
    if (powerUps[powerUp as keyof typeof powerUps] <= 0 || gameState !== "active") return

    setPowerUps((prev) => ({
      ...prev,
      [powerUp]: prev[powerUp as keyof typeof prev] - 1,
    }))

    switch (powerUp) {
      case "fiftyFifty":
        // Remove two wrong answers (mock implementation)
        break
      case "extraTime":
        setTimeRemaining((prev) => prev + 15)
        break
      case "doublePoints":
        setActivePowerUp("doublePoints")
        break
    }
  }

  const handleAnswerSelect = (answer: string | number) => {
    if (gameState !== "active") return
    setSelectedAnswer(answer)
  }

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null || gameState !== "active") return
    setGameState("answered")
    // Check if answer is correct (real logic)
    let correct = false
    if (currentQuestion?.type === "multiple-choice") {
      correct = selectedAnswer === currentQuestion.options?.findIndex(opt => opt === currentQuestion.correct_answer)
    } else if (currentQuestion?.type === "true-false") {
      correct = selectedAnswer === currentQuestion.correct_answer
    } else if (currentQuestion?.type === "short-answer") {
      correct = String(selectedAnswer).trim().toLowerCase() === String(currentQuestion.correct_answer).trim().toLowerCase()
    }
    setIsCorrect(correct)
    setShowFeedback(true)

    // Calculate score with bonuses
    let points = 0
    if (correct) {
      points = currentQuestion!.points

      // Time bonus (up to 50% extra points)
      const timeBonus = Math.floor((timeRemaining / currentQuestion!.timeLimit) * 0.5 * points)
      points += timeBonus

      // Streak multiplier
      if (playerStats.streak > 0) {
        points = Math.floor(points * (1 + playerStats.streak * 0.1))
      }

      // Double points power-up
      if (activePowerUp === "doublePoints") {
        points *= 2
        setActivePowerUp(null)
      }

      setPlayerStats((prev) => ({
        ...prev,
        score: prev.score + points,
        streak: prev.streak + 1,
        correctAnswers: prev.correctAnswers + 1,
        totalAnswered: prev.totalAnswered + 1,
        accuracy: Math.round(((prev.correctAnswers + 1) / (prev.totalAnswered + 1)) * 100),
      }))
    } else {
      setPlayerStats((prev) => ({
        ...prev,
        streak: 0,
        totalAnswered: prev.totalAnswered + 1,
        accuracy: Math.round((prev.correctAnswers / (prev.totalAnswered + 1)) * 100),
      }))
    }

    // Show results for 3 seconds then wait for next question
    setTimeout(() => {
      setShowFeedback(false)
      setGameState("waiting")
      setSelectedAnswer(null)
      setCurrentQuestion(null)
      setQuestionIndex(qi => qi + 1)
    }, 3000)
  }

  const handleTimeUp = () => {
    setGameState("answered")
    setIsCorrect(false)
    setShowFeedback(true)

    setPlayerStats((prev) => ({
      ...prev,
      streak: 0,
      totalAnswered: prev.totalAnswered + 1,
      accuracy: Math.round((prev.correctAnswers / (prev.totalAnswered + 1)) * 100),
    }))

    setTimeout(() => {
      setShowFeedback(false)
      setGameState("waiting")
      setSelectedAnswer(null)
      setCurrentQuestion(null)
    }, 3000)
  }

  useEffect(() => {
    // Request fullscreen when quiz starts
    if (gameState === "active") {
      const elem = document.documentElement
      if (elem.requestFullscreen) {
        elem.requestFullscreen()
      } else if ((elem as any).webkitRequestFullscreen) {
        (elem as any).webkitRequestFullscreen()
      } else if ((elem as any).msRequestFullscreen) {
        (elem as any).msRequestFullscreen()
      }
    }
    // Exit fullscreen when quiz ends
    if (gameState === "completed" || gameState === "waiting") {
      if (document.fullscreenElement) {
        document.exitFullscreen()
      }
    }
  }, [gameState])

  // Proctoring event handler
  useEffect(() => {
    function triggerProctorViolation() {
      if (violationTriggeredRef.current) return; // Prevent double trigger
      violationTriggeredRef.current = true;
      setProctorViolations((prev) => {
        if (prev >= 2) {
          router.replace("/participant/quiz/disqualified");
          return prev + 1
        } else {
          setShowProctorModal(true)
          return prev + 1
        }
      })
    }
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && gameState === "active") {
        triggerProctorViolation()
      }
    }
    function handleBlur() {
      if (gameState === "active") {
        triggerProctorViolation()
      }
    }
    function handleFullscreenChange() {
      if (!document.fullscreenElement && gameState === "active") {
        triggerProctorViolation()
      }
    }
    window.addEventListener("blur", handleBlur)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    document.addEventListener("fullscreenchange", handleFullscreenChange)
    return () => {
      window.removeEventListener("blur", handleBlur)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      document.removeEventListener("fullscreenchange", handleFullscreenChange)
    }
  }, [gameState])

  // Proctoring modal logic (force quit site when timer runs out or after 2 warnings)
  useEffect(() => {
    if (showProctorModal) {
      setProctorTimer(10)
      if (proctorIntervalRef.current) clearInterval(proctorIntervalRef.current)
      proctorIntervalRef.current = setInterval(() => {
        setProctorTimer((prev) => {
          if (prev <= 1) {
            clearInterval(proctorIntervalRef.current!)
            setShowProctorModal(false)
            // Force quit site when timer runs out
            router.replace("/participant/quiz/disqualified");
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (proctorIntervalRef.current) {
        clearInterval(proctorIntervalRef.current)
      }
      violationTriggeredRef.current = false; // Allow future triggers
    }
    return () => {
      if (proctorIntervalRef.current) {
        clearInterval(proctorIntervalRef.current)
      }
    }
  }, [showProctorModal, proctorViolations])

  // Resume exam handler
  function handleResumeExam() {
    setShowProctorModal(false)
    // Re-enter fullscreen
    const elem = document.documentElement
    if (elem.requestFullscreen) {
      elem.requestFullscreen()
    } else if ((elem as any).webkitRequestFullscreen) {
      (elem as any).webkitRequestFullscreen()
    } else if ((elem as any).msRequestFullscreen) {
      (elem as any).msRequestFullscreen()
    }
  }

  // Only show game content if questions are loaded
  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-xl text-gray-500">Waiting for host to start the quiz or loading questions...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {showProctorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg p-8 text-center max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-4 text-red-600">Proctoring Violation</h2>
            <p className="mb-4">
              You exited fullscreen or switched tabs/windows.<br />
              You must resume the exam within <span className="font-bold">{proctorTimer}</span> seconds or the exam will close.
            </p>
            <Button onClick={handleResumeExam} className="mt-2">Resume Exam</Button>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent drop-shadow-lg flex items-center gap-2 animate-pulse">
              <Trophy className="w-7 h-7 text-yellow-400 animate-bounce" />
              <span>{playerName}</span>
            </h1>
            <p className="text-balance">Quiz Code: {quizCode}</p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-2">
            #{playerStats.position}
          </Badge>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{playerStats.score}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Score</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">
                {playerStats.streak > 0 && "🔥"} {playerStats.streak}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Streak</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{playerStats.accuracy}%</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Accuracy</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">#{playerStats.position}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400">Rank</div>
            </CardContent>
          </Card>
        </div>

        {/* Power-ups */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Power-ups</h3>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPowerUps((prev) => ({ ...prev, fiftyFifty: prev.fiftyFifty - 1 }))}
                  disabled={powerUps.fiftyFifty <= 0 || gameState !== "active"}
                >
                  50/50 ({powerUps.fiftyFifty})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPowerUps((prev) => ({ ...prev, extraTime: prev.extraTime - 1 }))}
                  disabled={powerUps.extraTime <= 0 || gameState !== "active"}
                >
                  +Time ({powerUps.extraTime})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActivePowerUp("doublePoints")}
                  disabled={powerUps.doublePoints <= 0 || gameState !== "active"}
                  className={activePowerUp === "doublePoints" ? "bg-yellow-100 dark:bg-yellow-900" : ""}
                >
                  2x Points ({powerUps.doublePoints})
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Game Content */}
        <div className="max-w-2xl mx-auto">
          {gameState === "waiting" && (
            <Card className="text-center">
              <CardContent className="p-8">
                <div className="animate-pulse">
                  <Trophy className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                  <h2 className="text-xl font-semibold mb-2">Waiting for next question...</h2>
                  <p className="text-gray-600 dark:text-gray-400">
                    Get ready! The host will start the next question soon.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {(gameState === "active" || gameState === "answered") && currentQuestion && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">Question</CardTitle>
                  <div className="flex items-center gap-4">
                    {activePowerUp === "doublePoints" && <Badge className="bg-yellow-500">2x Points Active!</Badge>}
                    <div className="flex items-center gap-2 text-lg font-bold">
                      <Clock className="w-5 h-5" />
                      {timeRemaining}s
                    </div>
                  </div>
                </div>
                <Progress value={(timeRemaining / currentQuestion.timeLimit) * 100} className="h-2" />
              </CardHeader>
              <CardContent>
                {!showFeedback ? (
                  <div className="space-y-6">
                    <p className="text-lg font-medium">{currentQuestion.question}</p>

                    {currentQuestion.type === "multiple-choice" && (
                      <div className="space-y-3">
                        {currentQuestion.options?.map((option, index) => (
                          <Button
                            key={index}
                            variant={selectedAnswer === index ? "default" : "outline"}
                            className="w-full justify-start text-left h-auto p-4"
                            onClick={() => handleAnswerSelect(index)}
                            disabled={gameState === "answered"}
                          >
                            <span className="font-bold mr-3">{String.fromCharCode(65 + index)}.</span>
                            {option}
                          </Button>
                        ))}
                      </div>
                    )}

                    {currentQuestion.type === "true-false" && (
                      <div className="grid grid-cols-2 gap-4">
                        <Button
                          variant={selectedAnswer === "true" ? "default" : "outline"}
                          className="h-16 text-lg"
                          onClick={() => handleAnswerSelect("true")}
                          disabled={gameState === "answered"}
                        >
                          True
                        </Button>
                        <Button
                          variant={selectedAnswer === "false" ? "default" : "outline"}
                          className="h-16 text-lg"
                          onClick={() => handleAnswerSelect("false")}
                          disabled={gameState === "answered"}
                        >
                          False
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Points: {currentQuestion.points}
                        {activePowerUp === "doublePoints" && " × 2"}
                      </div>
                      <Button
                        onClick={handleSubmitAnswer}
                        disabled={selectedAnswer === null || gameState === "answered"}
                        size="lg"
                      >
                        Submit Answer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div
                      className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center ${
                        isCorrect ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"
                      }`}
                    >
                      {isCorrect ? (
                        <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="w-10 h-10 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <h3
                      className={`text-2xl font-bold ${
                        isCorrect ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      {isCorrect ? "Correct!" : "Incorrect!"}
                    </h3>
                    {isCorrect && (
                      <div className="space-y-2">
                        <p className="text-lg">
                          +{Math.floor(currentQuestion.points * (1 + playerStats.streak * 0.1))} points
                        </p>
                        {playerStats.streak > 1 && (
                          <p className="text-sm text-orange-600">🔥 Streak bonus: {playerStats.streak}x</p>
                        )}
                      </div>
                    )}
                    <p className="text-gray-600 dark:text-gray-400">Waiting for next question...</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
