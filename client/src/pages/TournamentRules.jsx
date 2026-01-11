import React from 'react';

const TournamentRules = () => {
  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8 text-gray-200">
      
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-primary-500">Tournament Rules</h1>
        <p className="text-gray-400">Madwaleni T20 CWC 2026</p>
      </div>

      {/* 1. Structure */}
      <section className="bg-dark-500 p-6 rounded-lg space-y-4">
        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-6">Tournament Structure</h2>
        <ul className="list-none list-inside space-y-6 ml-2 text-gray-400">
          <li><span className="text-white font-semibold text-sm">Group Stage</span> 
            <p className="text-sm"> 20 Teams in 4 Groups with 2 Qualifying </p>
            <p className="text-yellow-300 font-semibold text-sm"> * Initial Team Selection *</p>
          </li>
          <li><span className="text-white font-semibold text-sm">Super-8 Stage:</span> 
            <p className="text-sm"> 8 Teams in 1 group with 4 Qualifying</p>
            <p className="text-yellow-300 font-semibold text-sm"> * Second Team Selection *</p>
          </li>
          <li><span className="text-white font-semibold text-sm">Knockout Stage:</span>
          <p className="text-sm"> Semi-finals and Final </p>
          <p className="text-red-600 font-semibold text-sm"> - No new team selection - </p>
          </li>
        </ul>
        <div className="bg-dark-600 p-4 rounded border-l-4 border-primary-500 mt-4">
          <h3 className="text-sm font-semibold text-white mb-2 space-y-4">Selection Deadlines</h3>
          <ul className="text-sm space-y-4 font-semibold">
            <li className="space-y-4">Group Stage
                <p className="text-yellow-200"> 23:59 on Friday, 06 February 2026 </p>
            </li>
            <li className="space-y-4">Super-8 Stage
                <p className="text-yellow-200"> 23:59 on Friday, 20 February 2026</p>
            </li>
          </ul>
        </div>
      </section>

      {/* 2. Team Composition */}
      <section className="bg-dark-500 p-6 rounded-lg space-y-4">
        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-2">Team Composition</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <p className="mb-2 text-m">Your team must consist of <strong className="text-yellow-400">11 players</strong>:</p>
            <ul className="list-none text-sm list-inside space-y-1 text-gray-300">
              <li>3 Batters (minimum)</li>
              <li>3 Bowlers (minimum)</li>
              <li>1 Wicketkeeper (maximum)</li>
              <li>4 Free Choices <span className="text-xs">(batters/bowlers/allrounders)</span></li>
              <li className="text-yellow-400">1 Designated Captain <span className="text-xs">(see Bonus Multipliers)</span></li>
            </ul>
          </div>
          <div className="text-sm bg-dark-600 p-4 rounded text-gray-400">
            <p className="mb-2"><span className="text-red-600 font-bold">Note</span> 
            <p> No more than <span className="text-red-600 font-bold">1</span> Wicketkeeper can be selected </p> 
            <span className="text-xs text-red-600 font-italic"> *applies the whole tournament*</span></p> <br />
            <p> No more than <span className="text-red-600 font-bold">3</span> players can be selected from a single country. <br /> 
            <span className="text-xs text-primary-500 font-italic"> *during the group stage*</span></p>
          </div>
        </div>
      </section>

      {/* 3. Scoring Tables */}
      <section className="bg-dark-500 p-6 rounded-lg space-y-6">
        <h2 className="text-xl font-bold text-white border-b border-gray-700 pb-2">Scoring System           
        </h2>

        {/* General Principles */}

        <p className="text-sm text-gray-400 font-italic font-light"> All players receive points in all categories. 
        <br /> Points are allocated using the match scorecard at the  <span className="font-bold text-primary-500"> END </span> of the match </p>
        
        
        {/* Batting Table */}
        <div>
          <h3 className="text-lg font-semibold text-primary-500 mb-3">Batting</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              
              <tbody className="divide-y divide-gray-700">
                <tr><td className="p-3">Per Run</td><td className="p-3 text-center">1</td></tr>
                <tr><td className="p-3">Per 6 Hit</td><td className="p-3 text-center">5</td></tr>
                <tr><td className="p-3">Score 30+ / 50+ / 100+</td><td className="p-3 text-center">10 / 25 / 50</td></tr>
                <tr><td className="p-3 text-red-600">Duck (Out for 0 runs)</td><td className="p-3 text-center text-red-600">-10</td></tr>
                <tr><td className="p-3">SR &gt; 200(15+ balls)</td><td className="p-3 text-center">35</td></tr>
                <tr><td className="p-3 text-red-600">SR &lt; 100 (15+ balls)</td><td className="p-3 text-center text-red-600">-10</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Bowling Table */}
        <div>
          <h3 className="text-lg font-semibold text-primary-500 mb-3">Bowling</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-gray-700">
                <tr><td className="p-3">Per Wicket</td><td className="p-3 text-center">15</td></tr>
                <tr><td className="p-3">Per Dot Ball</td><td className="p-3 text-center">3</td></tr>
                <tr><td className="p-3">3+ / 5+ Wickets</td><td className="p-3 text-center">30 / 75</td></tr>
                <tr><td className="p-3">ER &lt; 8 (at least 2.0 overs)</td><td className="p-3 text-center">25</td></tr>
                <tr><td className="p-3 text-red-600">ER &gt; 10 (at least 1.0 overs)</td><td className="p-3 text-center text-red-600">-15</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Fielding & Bonus Table */}
        <div>
          <h3 className="text-lg font-semibold text-primary-500 mb-3">Fielding & Bonus</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-gray-700">
                <tr><td className="p-3 text-sm">Per Catch</td><td className="p-3 text-center">15</td></tr>
                <tr><td className="p-3">Per Runout involvement</td><td className="p-3 text-center">15</td></tr>
                <tr><td className="p-3">Per Stumping</td><td className="p-3 text-center">15</td></tr>
                <tr><td className="p-3">Player of the Match </td><td className="p-3 text-center">25</td></tr>
                <tr><td className="p-3">Hattrick</td><td className="p-3 text-center">100</td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </section>

      {/* 4. Multipliers */}
      <section className="bg-gradient-to-r from-primary-900/20 to-dark-500 p-6 rounded-lg border border-primary-500/30">
        <h2 className="text-xl font-bold text-primary-400 mb-2">Bonus Multipliers</h2>
        <p className="mb-4 text-sm text-gray-400"> Certain players earn points multipliers <br /> Points are rounded to the closest integer</p>
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-dark-600 p-4 rounded text-center">
             <span className="block text-l font-bold text-white mb-1">Captains</span>
             <span className="text-sm text-gray-400"> Your captain earns 2x points. <br />This stacks with country bonuses</span>
           </div>
           <div className="bg-dark-600 p-4 rounded text-center">
             <span className="block text-l font-bold text-white mb-1">1.25x Countries</span>
             <span className="text-sm text-gray-400">Ireland, Zimbabwe, Netherlands, Namibia, United Arab Emirates</span>
           </div>
           <div className="bg-dark-600 p-4 rounded text-center">
             <span className="block text-l font-bold text-white mb-1">1.5x Countries</span>
             <span className="text-sm text-gray-400">Nepal, USA, Canada, Oman, Italy</span>
           </div>
           
        </div>
      </section>

      {/* Substitutions */}
      <section className="bg-gradient-to-r from-primary-900/20 to-dark-500 p-6 rounded-lg border border-primary-500/30">
        <h2 className="text-xl font-bold text-primary-400 mb-2">Substitutions</h2>
        <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-dark-600 p-4 rounded items-center">
             <span className="block text-base text-white">Group Stage</span>
             <span className="text-sm text-gray-400 ">3 substitutions</span> 
             <span className=" block text-base text-white mt-4">Super-8 Stage</span>
             <span className="text-sm text-gray-400">Allocated based on <span className="text-primary-400"> Leaderboard Position</span> at the end of the group stage</span>
            
                      
             <table className="w-8/12 text-left text-sm bg-dark-600 p-4 rounded mx-auto mt-2 mb-4">
              <tbody className="divide-y divide-gray-700">
                <tr><td className="p-3 text-sm text-center"> 1st - 5th </td><td className="p-3 text-center">1 sub</td></tr>
                <tr><td className="p-3 text-sm text-center"> 6th - 10th</td><td className="p-3 text-center">2 subs</td></tr>
                <tr><td className="p-3 text-sm text-center">11th - 15th</td><td className="p-3 text-center">3 subs</td></tr>
                <tr><td className="p-3 text-sm text-center">&gt; 15th</td><td className="p-3 text-center">4 subs</td></tr>
              </tbody>
             </table>
             <span className="text-sm text-red-600 block"> Unused Substitutions are not carried over from the Group Stage to the Super-8s </span> <br />
             <span className="text-sm text-red-600 block"> No additional substitutions are allocated at the end of the Super-8s, but unused substitutions are carried over to the Knockout Stage</span>
            </div>
           <div className="bg-dark-600 p-4 rounded text-center">
             <span className="block text-l font-bold text-white mb-1">Timing</span>
             <span className="text-sm text-gray-400">Substitutions can be made at any time, but will only take effect from the start of the next match after the substitution was submitted</span>
           </div>
           <div className="bg-dark-600 p-4 rounded text-center">
             <span className="block text-l font-bold text-white mb-1">Substituting Captains</span>
             <span className="text-sm text-gray-400">Captains may be substituted, and the new player will assume the captaincy. <br />
             The captaincy can not be reassigned to another player in the team.</span>
           </div>
           <div className="bg-dark-600 p-4 rounded text-center">
             <span className="block text-l font-bold text-white mb-1">Team Composition</span>
             <span className="text-sm text-gray-400">Substitutions must maintain the team composition rules set out above <br />
             <span className="text-red-600">Substitutions that fail to maintain these rules will be rejected/reversed</span></span>
           </div>
           
        </div>
      </section>

    </div>
  );
};
export default TournamentRules;